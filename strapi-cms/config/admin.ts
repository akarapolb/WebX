import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    // Strapi 5.48 session model (options.expiresIn is deprecated). Values in ms.
    // BFF holds the opaque token without auto-refresh, so the idle window must be long.
    sessions: {
      idleSessionLifespan: env.int('ADMIN_IDLE_TTL', 1000 * 60 * 60 * 8), // 8h idle
      maxSessionLifespan: env.int('ADMIN_SESSION_LIFESPAN', 1000 * 60 * 60 * 8), // 8h absolute
      maxRefreshTokenLifespan: env.int('ADMIN_REFRESH_TTL', 1000 * 60 * 60 * 24),
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
});

export default config;
