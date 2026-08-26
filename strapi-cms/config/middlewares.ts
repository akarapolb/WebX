import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    // CORS — public-site (the actual running Next.js public site, both its
    // dev server and its local static-export server) needs this for any
    // direct browser->Strapi call, e.g. CookieConsent.tsx posting to
    // /api/consent-logs. localhost:8080 predates public-site entirely: it
    // was for site/DGA-Website, a separate static procurement-demo
    // prototype that was never the running product — kept here since it's
    // harmless, not because anything still depends on it. A real deployment
    // adds its production public-site domain(s) via WEBX_PUBLIC_SITE_ORIGINS
    // (comma-separated) rather than another code change.
    name: 'strapi::cors',
    config: {
      origin: [
        'http://localhost:8080', 'http://127.0.0.1:8080',
        'http://localhost:3100', 'http://localhost:8095',
        ...env.array('WEBX_PUBLIC_SITE_ORIGINS', []),
      ],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    },
  },
  'strapi::poweredBy',
  'global::traffic-log',
  'global::rate-limit',
  'global::admin-mfa',
  'global::seo',
  'strapi::query',
  'strapi::body',
  'global::tenant',
  'global::captcha-guard',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
