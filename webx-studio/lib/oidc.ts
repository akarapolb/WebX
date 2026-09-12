// OIDC (Keycloak) protocol mechanics — Authorization Code + PKCE. Mirrors
// totp.ts's role for MFA: protocol/crypto details live here, orchestration
// (JIT provisioning, session promotion) lives in governance.ts. Uses
// openid-client rather than hand-rolled fetch calls (unlike strapi.ts /
// wordpress.ts's usual raw-fetch house style) because verifying an ID
// token's signature against a rotating JWKS is real security-critical
// crypto code, not worth rolling by hand.
import "server-only";
import * as client from "openid-client";
import dns from "node:dns/promises";
import net from "node:net";

export type OidcTenantConfig = { issuerUrl: string; clientId: string; clientSecret: string };

// SSRF guard — governance.ts's saveTenantSsoConfig only ever validated
// issuerUrl with `new URL(...)`, no scheme/host allowlist and no private-IP
// blocking, before feeding it into this module's server-side discover()
// fetch. A workspace admin is a real, low-privilege actor in this self-serve
// SaaS (not an operator), so an admin who can edit their own tenant's SSO
// settings could point this at an internal service (a cloud metadata
// endpoint, another container on the same docker network, localhost) and
// have Strapi/webx-studio's own server fetch it on their behalf. Found in a
// full-codebase audit (2026-09-12).
//
// Checked here (inside discover(), the one function both the login-start and
// callback paths funnel through) rather than only at save time in
// governance.ts: save-time validation alone is a TOCTOU gap an admin could
// route around by pointing DNS at a public IP when saving, then repointing
// it at an internal one before the next real login attempt. This still
// isn't a complete defense against that specific DNS-rebinding variant
// (resolving here and then letting openid-client's own fetch do its own
// independent DNS resolution afterward still leaves a race window between
// the two lookups) — closing that fully would mean replacing openid-client's
// networking with a custom dispatcher that pins the resolved IP for the
// actual connection, which is a much bigger change than this finding's
// severity warrants for a same-pass fix. What this DOES fully close is the
// realistic, simple case: an admin directly configuring an internal URL.
const BLOCKED_V4 = [
  { base: [0, 0, 0, 0], bits: 8 }, // 0.0.0.0/8
  { base: [10, 0, 0, 0], bits: 8 }, // RFC1918
  { base: [100, 64, 0, 0], bits: 10 }, // CGNAT (RFC6598)
  { base: [127, 0, 0, 0], bits: 8 }, // loopback
  { base: [169, 254, 0, 0], bits: 16 }, // link-local — includes the 169.254.169.254 cloud metadata endpoint
  { base: [172, 16, 0, 0], bits: 12 }, // RFC1918 (also covers docker's default bridge range)
  { base: [192, 168, 0, 0], bits: 16 }, // RFC1918
] as const;

function ipv4InBlockedRange(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return true; // malformed — reject closed
  return BLOCKED_V4.some(({ base, bits }) => {
    const fullBytes = Math.floor(bits / 8);
    const remBits = bits % 8;
    for (let i = 0; i < fullBytes; i++) if (octets[i] !== base[i]) return false;
    if (remBits === 0) return true;
    const mask = 0xff << (8 - remBits);
    return (octets[fullBytes] & mask) === (base[fullBytes] & mask);
  });
}

function isBlockedAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return ipv4InBlockedRange(ip);
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true; // loopback / unspecified
    if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true; // link-local / unique-local
    const v4mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4mapped) return ipv4InBlockedRange(v4mapped[1]);
    return false;
  }
  return true; // not a valid IP literal at all — reject closed
}

/** Exported for governance.ts's saveTenantSsoConfig, so a bad issuer host is
 * rejected with an immediate, specific error at save time too — not a
 * substitute for the check inside discover() (see that function's own
 * comment on why save-time validation alone isn't sufficient), just faster
 * feedback for the common case of an admin simply mistyping/misconfiguring. */
export async function assertIssuerHostIsPublic(issuerUrl: string): Promise<void> {
  // Local dev/testing legitimately targets a plain-HTTP, loopback/docker-
  // internal Keycloak (this file's own existing NODE_ENV escape hatch for
  // allowInsecureRequests, right below, is the same story) — only enforce
  // in production, where every tenant's issuer is a real external IdP.
  if (process.env.NODE_ENV !== "production") return;
  const host = new URL(issuerUrl).hostname;
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error("SSO issuer URL resolves to a disallowed internal address");
    return;
  }
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (records.length === 0 || records.some((r) => isBlockedAddress(r.address))) {
    throw new Error("SSO issuer URL resolves to a disallowed internal address");
  }
}

async function discover(cfg: OidcTenantConfig) {
  await assertIssuerHostIsPublic(cfg.issuerUrl);
  // oauth4webapi (openid-client's underlying library) refuses plain HTTP by
  // default — a real safeguard, kept on in production. Local dev/testing
  // against a plain-HTTP Keycloak instance (e.g. localhost) needs it
  // explicitly relaxed; never do this outside NODE_ENV !== "production".
  const options = process.env.NODE_ENV === "production" ? undefined : { execute: [client.allowInsecureRequests] };
  return client.discovery(new URL(cfg.issuerUrl), cfg.clientId, cfg.clientSecret, undefined, options);
}

/** Builds the redirect-to-Keycloak URL plus the PKCE verifier + state that
 * must be stashed server-side (SSO_PENDING_COOKIE) until the callback —
 * never trust anything the client sends back except by comparing against
 * these. */
export async function buildAuthorizationRequest(
  cfg: OidcTenantConfig, redirectUri: string
): Promise<{ url: string; codeVerifier: string; state: string }> {
  const config = await discover(cfg);
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
  return { url: url.href, codeVerifier, state };
}

/** Exchanges the authorization code for tokens and verifies the ID token
 * (signature against the realm's JWKS, exp/iss/aud, state match) — all
 * inside authorizationCodeGrant()/claims(), never hand-rolled here. Throws
 * on any failure (bad code, state mismatch, bad signature, expired). */
export async function exchangeCode(
  cfg: OidcTenantConfig, callbackUrl: URL, codeVerifier: string, expectedState: string
): Promise<{ email: string; emailVerified: boolean; sub: string }> {
  const config = await discover(cfg);
  const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState,
  });
  const claims = tokens.claims();
  if (!claims?.email) throw new Error("IdP did not return an email claim");
  return { email: String(claims.email).toLowerCase(), emailVerified: Boolean(claims.email_verified), sub: String(claims.sub) };
}
