import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  // Off by default (Koa/Strapi then use the raw socket address for
  // ctx.request.ip — correct for a docker-compose-only deploy with no
  // reverse proxy in front). Set TRUST_PROXY=true only when Strapi
  // genuinely sits behind a reverse proxy you control (DEPLOY.md's own
  // "HTTPS/TLS terminated in front" step) — this is what makes
  // ctx.request.ip trust X-Forwarded-For at all; middlewares/rate-limit.ts
  // already reads ctx.request.ip correctly and needs this to see real
  // per-client IPs behind a proxy. middlewares/traffic-log.ts used to
  // parse X-Forwarded-For itself unconditionally regardless of this
  // setting — meaning any external client could forge the IP address this
  // legally-mandated log records (พ.ร.บ.คอมพิวเตอร์ retention) just by
  // sending the header — found in a full-codebase audit (2026-09-12);
  // fixed to read ctx.request.ip too, so both middlewares now agree and
  // both are only as trusting of X-Forwarded-For as this flag says to be.
  proxy: env.bool('TRUST_PROXY', false),
});

export default config;
