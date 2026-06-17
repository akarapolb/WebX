import type { Core } from '@strapi/strapi';
import { ensureThaiLocale, ensurePublicPermissions, seedContent } from './seed/seed';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * ตั้งค่า locale ไทย, สิทธิ์ Public และ seed เนื้อหาหน้าแรกครั้งแรก (idempotent)
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    try {
      await ensureThaiLocale(strapi);
      await seedContent(strapi);
      await ensurePublicPermissions(strapi);
    } catch (err) {
      strapi.log.error('[bootstrap] seed/setup failed: ' + (err as Error).stack);
    }
  },
};
