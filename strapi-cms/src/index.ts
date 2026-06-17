import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import {
  ensureThaiLocale, ensurePublicPermissions, seedContent, seedJobs, seedDemos,
  seedTenants, backfillTenant, seedTenantBContent, seedEditors, grantLocalesToEditorRoles,
} from './seed/seed';

/** content type ที่ผูกกับ tenant (ต้อง scope) */
const SCOPED = new Set([
  'api::home-page.home-page',
  'api::article.article', 'api::service.service', 'api::faq.faq', 'api::job.job',
  'api::banner.banner', 'api::video.video', 'api::award.award',
  'api::complaint.complaint', 'api::application.application', 'api::registration.registration',
]);
const READS = new Set(['findMany', 'findFirst', 'findOne', 'count']);
const GUARDED = new Set(['update', 'delete', 'publish', 'unpublish']);

/** แคช email(admin/editor) → tenant สำหรับ per-tenant RBAC หลังบ้าน */
let adminCache: { at: number; map: Map<string, { key: string; id: number }> } = { at: 0, map: new Map() };
async function adminTenantFor(strapi: any, email: string) {
  const now = Date.now();
  if (now - adminCache.at > 30000 || adminCache.map.size === 0) {
    const list = await strapi.db.query('api::tenant.tenant').findMany({ select: ['id', 'key', 'adminEmails'], limit: 500 });
    const m = new Map<string, { key: string; id: number }>();
    list.forEach((t: any) => (t.adminEmails || []).forEach((e: string) => m.set(String(e).toLowerCase(), { key: t.key, id: t.id })));
    adminCache = { at: now, map: m };
  }
  return adminCache.map.get(String(email).toLowerCase()) || null;
}

/**
 * tenant ที่มีผลต่อ request ปัจจุบัน:
 * - public API: มาจาก HTTP middleware (Host/X-Tenant/?tenant) → ctx.state.tenantKey
 * - หลังบ้าน (content-manager): มาจากอีเมล admin ที่ล็อกอิน → Tenant.adminEmails
 * - super admin / ตอน seed: คืน null → ไม่ scope (เห็น/แก้ได้ทุก tenant)
 */
async function effectiveTenant(strapi: any) {
  const reqCtx: any = strapi.requestContext?.get?.();
  if (!reqCtx) return null;
  if (reqCtx.state?.tenantKey) return { key: reqCtx.state.tenantKey, id: reqCtx.state.tenantId };
  const email = reqCtx.state?.user?.email;
  if (email) return await adminTenantFor(strapi, email);
  return null;
}

export default {
  /**
   * Document Service middleware — บังคับ scope ตาม tenant ใต้ชั้น validate ของ REST
   * ครอบคลุมทั้ง public API และหลังบ้าน (content-manager) ของ editor ที่สังกัด tenant
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    (strapi.documents as any).use(async (context: any, next: any) => {
      if (!SCOPED.has(context.uid)) return next();
      const eff = await effectiveTenant(strapi);
      if (!eff) return next(); // super admin / seed / ไม่มี tenant → ไม่ scope

      const action = context.action;
      context.params = context.params || {};

      if (READS.has(action)) {
        const tf = { tenant: { key: eff.key } };
        context.params.filters = context.params.filters ? { $and: [context.params.filters, tf] } : tf;
      } else if (action === 'create') {
        context.params.data = { ...(context.params.data || {}), tenant: eff.id };
      } else if (GUARDED.has(action)) {
        // กันไม่ให้แก้/ลบ/เผยแพร่ ข้อมูลของ tenant อื่น
        const docId = context.params.documentId;
        if (docId) {
          const existing = await strapi.db.query(context.uid).findOne({ where: { documentId: docId }, populate: { tenant: true } });
          const owner = existing?.tenant?.key;
          if (owner && owner !== eff.key) {
            throw new errors.ForbiddenError('ไม่มีสิทธิ์ดำเนินการกับข้อมูลของหน่วยงานอื่น (cross-tenant)');
          }
        }
        if (action === 'update') context.params.data = { ...(context.params.data || {}), tenant: eff.id };
      }
      return next();
    });
  },

  /**
   * Bootstrap — locale ไทย, tenants, seed เนื้อหา, backfill, editor accounts, สิทธิ์ public
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
      await seedEditors(strapi);
      await grantLocalesToEditorRoles(strapi);
      await ensurePublicPermissions(strapi);
    } catch (err) {
      strapi.log.error('[bootstrap] seed/setup failed: ' + (err as Error).stack);
    }
  },
};
