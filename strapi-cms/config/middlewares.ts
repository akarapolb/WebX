import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    // เปิด CORS ให้หน้าเว็บ static (DGA) เรียก API ได้ระหว่างพัฒนา
    name: 'strapi::cors',
    config: {
      origin: ['http://localhost:8080', 'http://127.0.0.1:8080'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    },
  },
  'strapi::poweredBy',
  'global::rate-limit',
  'global::admin-mfa',
  'strapi::query',
  'strapi::body',
  'global::tenant',
  'global::captcha-guard',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
