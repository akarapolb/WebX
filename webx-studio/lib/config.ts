// Central config — all values come from env so WebX Studio is backend-agnostic.
export const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337";
export const WORDPRESS_URL = process.env.WORDPRESS_URL || "http://localhost:8081/wp-json";
export const SESSION_COOKIE = process.env.WEBX_SESSION_COOKIE || "webx_session";
export const SESSION_TTL = Number(process.env.WEBX_SESSION_TTL || 1800); // seconds
// Phase 6 — which engine THIS session's token authenticates against. Was a
// single global CMS_ENGINE env var (one engine for the whole deployment);
// engine is now a per-tenant field (strapi-cms's Tenant.engine), resolved at
// login time and carried in this cookie for the life of the session — see
// lib/strapi.ts's sessionEngine() and app/api/auth/login/route.ts.
export const ENGINE_COOKIE = process.env.WEBX_ENGINE_COOKIE || "webx_session_engine";
// refresh token (Strapi 5 rotating, single-use) — used to mint fresh access tokens
export const REFRESH_COOKIE = process.env.WEBX_REFRESH_COOKIE || "webx_refresh";
export const REFRESH_TTL = Number(process.env.WEBX_REFRESH_TTL || 60 * 60 * 24); // 24h
// Real per-user MFA (see lib/totp.ts + governance.ts's MFA functions) —
// after password verification succeeds for an MFA-enrolled account, the
// real Strapi token is stashed here (short-lived, distinct cookie) instead
// of going straight into SESSION_COOKIE, until a correct code lands at
// /api/auth/mfa/verify-login and promotes it. Never reaches client JS,
// same httpOnly model as the real session cookie.
export const MFA_PENDING_COOKIE = process.env.WEBX_MFA_PENDING_COOKIE || "webx_mfa_pending";
export const MFA_PENDING_TTL = Number(process.env.WEBX_MFA_PENDING_TTL || 300); // 5 minutes
// SSO (Keycloak/OIDC) login-in-progress — the PKCE code_verifier + OAuth
// state get stashed here (short-lived, distinct cookie, httpOnly) between
// /api/auth/sso/login's redirect to the IdP and /api/auth/sso/callback's
// return leg. Same shape as MFA_PENDING_COOKIE above; longer TTL since the
// user authenticates at an external IdP (possibly with its own MFA) in
// between, not just types a 6-digit code.
export const SSO_PENDING_COOKIE = process.env.WEBX_SSO_PENDING_COOKIE || "webx_sso_pending";
export const SSO_PENDING_TTL = Number(process.env.WEBX_SSO_PENDING_TTL || 600); // 10 minutes
// AES-256-GCM key (32 raw bytes, base64-encoded) for lib/crypto.ts —
// encrypts per-tenant Keycloak client secrets and JIT-provisioned shadow
// Strapi passwords at rest (see lib/cms/governance.ts's ssoLogin).
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
export const WEBX_ENCRYPTION_KEY = process.env.WEBX_ENCRYPTION_KEY || "";
// Shared secret for governance.ts's internal cross-tenant ownership lookup
// (strapi-cms/src/api/internal) — must match Strapi's WEBX_INTERNAL_SECRET.
export const STRAPI_INTERNAL_SECRET = process.env.STRAPI_INTERNAL_SECRET || "";

// Phase 5 — release scheduler. Since /api/internal/releases/process-due is
// triggered by an external scheduler with no admin session, it logs in as
// a dedicated service account (see strapi-cms/src/seed/seed.ts's
// seedScheduler) rather than reading a session cookie.
export const STRAPI_SCHEDULER_EMAIL = process.env.STRAPI_SCHEDULER_EMAIL || "";
export const STRAPI_SCHEDULER_PASSWORD = process.env.STRAPI_SCHEDULER_PASSWORD || "";
export const WORDPRESS_SCHEDULER_USERNAME = process.env.WORDPRESS_SCHEDULER_USERNAME || "";
export const WORDPRESS_SCHEDULER_APP_PASSWORD = process.env.WORDPRESS_SCHEDULER_APP_PASSWORD || "";
// Shared secret the process-due route itself checks (X-Internal-Secret
// header) — the reverse direction of STRAPI_INTERNAL_SECRET above: something
// external calling INTO webx-studio, not webx-studio calling into Strapi.
export const WEBX_SCHEDULER_SECRET = process.env.WEBX_SCHEDULER_SECRET || "";
