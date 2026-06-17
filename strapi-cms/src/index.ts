import type { Core } from '@strapi/strapi';
import {
  ensureThaiLocale, ensurePublicPermissions, seedContent, seedJobs, seedDemos,
  seedTenants, backfillTenant, seedTenantBContent,
} from './seed/seed';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  /**
   * Document Service middleware — บังคับ scope ตาม tenant ใต้ชั้น validate ของ REST
   * อ่าน tenant ที่ HTTP middleware resolve ไว้ผ่าน strapi.requestContext (AsyncLocalStorage)
   * - find/findMany/findFirst/count: ฉีด filter tenant
   * - create (ฟอร์มสาธารณะ): ตั้ง data.tenant
   * ตอน seed (ไม่มี request context) จะไม่ scope — จึง seed ข้ามทุก tenant ได้ตามปกติ
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    const SCOPED = new Set([
      'api::article.article', 'api::service.service', 'api::faq.faq', 'api::job.job',
      'api::banner.banner', 'api::video.video', 'api::award.award',
      'api::complaint.complaint', 'api::application.application', 'api::registration.registration',
    ]);
    const READS = new Set(['findMany', 'findFirst', 'findOne', 'count']);

    (strapi.documents as any).use(async (context: any, next: any) => {
      if (!SCOPED.has(context.uid)) return next();
      const reqCtx: any = (strapi as any).requestContext?.get?.();
      const tenantKey = reqCtx?.state?.tenantKey;
      const tenantId = reqCtx?.state?.tenantId;
      if (!tenantKey) return next(); // ไม่มี request context (เช่นตอน seed) → ไม่ scope

      if (READS.has(context.action)) {
        const tf = { tenant: { key: tenantKey } };
        context.params = context.params || {};
        context.params.filters = context.params.filters
          ? { $and: [context.params.filters, tf] }
          : tf;
      } else if (context.action === 'create' && tenantId) {
        context.params = context.params || {};
        context.params.data = { ...(context.params.data || {}), tenant: tenantId };
      }
      return next();
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * ตั้งค่า locale ไทย, สิทธิ์ Public และ seed เนื้อหาหน้าแรกครั้งแรก (idempotent)
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    try {
      await ensureThaiLocale(strapi);
      await seedTenants(strapi);
      await seedContent(strapi);
      await seedJobs(strapi);
      await seedDemos(strapi);
      await backfillTenant(strapi);
      await seedTenantBContent(strapi);
      await ensurePublicPermissions(strapi);
    } catch (err) {
      strapi.log.error('[bootstrap] seed/setup failed: ' + (err as Error).stack);
    }
  },
};
