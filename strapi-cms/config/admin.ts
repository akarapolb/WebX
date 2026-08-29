import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    // Strapi 5.48 session model (options.expiresIn is deprecated). Values in SECONDS.
    // Defaults are short (idleSessionLifespan = 2h); the BFF holds the opaque token
    // without auto-refresh, so widen the idle window to keep admins signed in.
    sessions: {
      idleSessionLifespan: env.int('ADMIN_IDLE_TTL', 60 * 60 * 8), // 8h idle
      maxSessionLifespan: env.int('ADMIN_SESSION_LIFESPAN', 60 * 60 * 24), // 24h absolute
      maxRefreshTokenLifespan: env.int('ADMIN_REFRESH_TTL', 60 * 60 * 24 * 30), // 30d
      idleRefreshTokenLifespan: env.int('ADMIN_IDLE_REFRESH_TTL', 60 * 60 * 24 * 14), // 14d
    },
    options: {
      expiresIn: env('ADMIN_SESSION_TTL', '8h'),
    },
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY'),
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
    docLinks: env.bool('FLAG_DOC_LINKS', true),
  },
  // Strapi's OWN built-in /admin/login limiter (@strapi/admin's rateLimit
  // middleware, node_modules/@strapi/admin/.../middlewares/rateLimit.js) —
  // separate from this app's own src/middlewares/rate-limit.ts, and it was
  // never configured here at all, so it ran on Strapi's hardcoded default:
  // max 5 attempts per 5-minute window. It's already correctly scoped per
  // (email, path, ip) — not the shared-bucket bug src/middlewares/
  // rate-limit.ts had — but 5-per-5-min is tight for a system with a
  // seeded service account (the release/SSO-reconcile schedulers, the BFF's
  // own scheduler-token refresh) re-authenticating as part of normal
  // operation, not just human logins. Found live, repeatedly, this session:
  // this default is very likely the actual cause of most of that friction,
  // not (only) the custom middleware. Widened, not disabled — 20 attempts
  // in 10 minutes still meaningfully blocks real brute-forcing.
  rateLimit: {
    enabled: true,
    // Strapi's own bundled type wants a plain number (ms) here even though
    // its OWN runtime default is the object form {min: 5} — an apparent
    // mismatch in Strapi's own types vs. its own default value. Milliseconds
    // is the one form that satisfies the type AND is a format koa2-ratelimit
    // (the library actually doing the work underneath) accepts directly.
    interval: env.int('ADMIN_LOGIN_RATE_LIMIT_WINDOW_MIN', 10) * 60 * 1000,
    max: env.int('ADMIN_LOGIN_RATE_LIMIT_MAX', 20),
  },
});

export default config;
