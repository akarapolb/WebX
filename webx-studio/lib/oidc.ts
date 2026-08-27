// OIDC (Keycloak) protocol mechanics — Authorization Code + PKCE. Mirrors
// totp.ts's role for MFA: protocol/crypto details live here, orchestration
// (JIT provisioning, session promotion) lives in governance.ts. Uses
// openid-client rather than hand-rolled fetch calls (unlike strapi.ts /
// wordpress.ts's usual raw-fetch house style) because verifying an ID
// token's signature against a rotating JWKS is real security-critical
// crypto code, not worth rolling by hand.
import "server-only";
import * as client from "openid-client";

export type OidcTenantConfig = { issuerUrl: string; clientId: string; clientSecret: string };

async function discover(cfg: OidcTenantConfig) {
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
