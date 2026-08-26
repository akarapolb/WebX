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
