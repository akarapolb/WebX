import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import {
  ensureThaiLocale, ensurePublicPermissions, seedContent, seedJobs, seedOrstRoyalSocietyJobs, seedDemos,
  seedTenants, seedOrstRoyalSocietyTenants, backfillTenant, seedTenantBContent, seedEditors, grantLocalesToEditorRoles,
  ensureTenantAnalytics, seedModules, seedFulltextDemo, ensureTenantLiveChat, seedLanding, seedGroupA, enrichGroupB, seedCmsCore,
  seedScheduler, ensureEditorPublishPermissions, seedFlatNavItems, ensurePageBuilderEditorPermissions, ensureBlockTypeFieldPermissions,
} from './seed/seed';
import { seedCollectionPages } from './seed/seedCollectionPages';
import { seedFormPages } from './seed/seedFormPages';
import { adminTenantFor, resolveCustomRolePerms } from './utils/custom-role';

/** content type ที่ผูกกับ tenant (ต้อง scope) */
const SCOPED = new Set([
  'api::home-page.home-page',
  'api::article.article', 'api::service.service', 'api::faq.faq', 'api::job.job',
  'api::banner.banner', 'api::video.video', 'api::award.award',
  'api::complaint.complaint', 'api::application.application', 'api::registration.registration',
  'api::consent-log.consent-log',
  'api::download.download', 'api::ebook.ebook', 'api::gallery.gallery', 'api::popup.popup', 'api::poll.poll',
  'api::landing.landing', 'api::page.page',
  'api::blog.blog', 'api::catalog.catalog', 'api::weblink.weblink', 'api::top-graphic.top-graphic',
  'api::event.event', 'api::location.location', 'api::sitemap-node.sitemap-node',
  'api::menu-item.menu-item', 'api::contact-message.contact-message',
  'api::breaking-news.breaking-news',
  // block-type, icon, release, review: each carries a `tenant` relation
  // (same shape as everything else above) but was missing from this set —
  // found in a full-codebase audit (2026-09-12). Since this middleware
  // return-nexts immediately for anything not in SCOPED, block-type/icon
  // had ZERO tenant filter/stamp/ownership-check despite Editor/Author
  // already holding full content-manager CRUD on both (seed.ts) — any
  // tenant's editor could read/write/delete another tenant's custom block
  // definitions and icon library. release/review share the same schema gap
  // but aren't currently granted to non-super-admin roles, so were latent
  // rather than confirmed-exploitable. Root cause: this Set is hand-
  // enumerated rather than derived from "has a `tenant` relation" — a
  // schema-driven SCOPED (or a boot-time assertion that fails loudly on any
  // tenant-relation content type missing here) would prevent this class of
  // bug recurring a fifth time.
  'api::block-type.block-type', 'api::icon.icon', 'api::release.release', 'api::review.review',
  // Deliberately NOT 'plugin::upload.file' here (media library gap, TOR —
  // search/tag/reuse/crop/caption): confirmed live that NEITHER path this
  // middleware could otherwise ride on actually reaches it — the upload
  // plugin's own /upload/* routes call strapi.db.query(FILE_MODEL_UID)
  // directly (never strapi.documents(uid), per its dist source), and
  // content-manager's generic collection-types route 403s on it too (the
  // plugin marks it `content-manager: { visible: false }`). Tenant scoping
  // for media instead lives entirely in its own purpose-built API —
  // src/api/media-meta — which does the same filter/stamp/guard job this
  // middleware does for everything else, just explicitly.
]);
const READS = new Set(['findMany', 'findFirst', 'findOne', 'count']);
const GUARDED = new Set(['update', 'delete', 'publish', 'unpublish']);
const WRITE_ACTIONS = new Set(['create', 'update', 'delete', 'publish', 'unpublish']);

/** Field-level RBAC — policy cache + strip ฟิลด์ที่ role ปัจจุบันไม่มีสิทธิ์เขียน (hidden/readonly) */
let policyCache: { at: number; list: any[] } = { at: 0, list: [] };
async function getFieldPolicies(strapi: any) {
  const now = Date.now();
  if (now - policyCache.at > 15000) {
    try { policyCache = { at: now, list: await strapi.db.query('api::field-policy.field-policy').findMany({ limit: 500 }) }; }
    catch { policyCache = { at: now, list: [] }; }
  }
  return policyCache.list;
}
async function roleNamesOf(strapi: any, user: any): Promise<string[]> {
  const roles = user?.roles || [];
  const names = roles.map((r: any) => r?.name).filter(Boolean);
  if (names.length) return names;
  const ids = roles.map((r: any) => r?.id).filter(Boolean);
  if (!ids.length) return [];
  try { const rs = await strapi.db.query('admin::role').findMany({ where: { id: { $in: ids } }, select: ['name'] }); return rs.map((r: any) => r.name); }
  catch { return []; }
}
async function isSuperAdmin(strapi: any, user: any): Promise<boolean> {
  const roles = user?.roles || [];
  if (roles.some((r: any) => r?.code === 'strapi-super-admin' || r?.name === 'Super Admin')) return true;
  const ids = roles.map((r: any) => r?.id).filter(Boolean);
  if (!ids.length) return false;
  try { const rs = await strapi.db.query('admin::role').findMany({ where: { id: { $in: ids } }, select: ['code'] }); return rs.some((r: any) => r.code === 'strapi-super-admin'); }
  catch { return false; }
}
async function stripPolicyFields(strapi: any, user: any, uid: string, data: any) {
  if (!data || typeof data !== 'object') return data;
  if (await isSuperAdmin(strapi, user)) return data; // super admins bypass field policies
  const policies = await getFieldPolicies(strapi);
  if (!policies.length) return data;
  const names = await roleNamesOf(strapi, user);
  if (!names.length) return data;
  const forbidden = new Set<string>();
  for (const p of policies) {
    if (p.contentType === uid && names.includes(p.role)) {
      (Array.isArray(p.hidden) ? p.hidden : []).forEach((f: string) => forbidden.add(f));
      (Array.isArray(p.readonly) ? p.readonly : []).forEach((f: string) => forbidden.add(f));
    }
  }
  if (!forbidden.size) return data;
  const out: any = {};
  for (const k of Object.keys(data)) if (!forbidden.has(k)) out[k] = data[k];
  return out;
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

const SCHEDULER_EMAIL = (process.env.STRAPI_SCHEDULER_EMAIL || 'scheduler@webx.local').toLowerCase();

function requestHeader(reqCtx: any, name: string): string {
  const v = reqCtx?.get ? reqCtx.get(name) : reqCtx?.request?.header?.[name];
  return typeof v === 'string' ? v : '';
}

/**
 * webx-studio's background agent jobs call Strapi with the scheduler service
 * account (a Super Admin) and name the job's owner in X-WebX-Acting-Email and
 * X-WebX-Acting-Tenant. webx-studio enforces the owner's scope itself; this is
 * the backstop. The headers are honoured only from the scheduler account, and
 * only to narrow: the owner must belong to the named tenant, and the write is
 * then scoped and field-policed as that owner. From anyone else they are
 * ignored, since their own session already scopes them.
 */
async function actingIdentity(strapi: any, reqCtx: any): Promise<{ email: string; tenant: any; user: any } | null> {
  const email = requestHeader(reqCtx, 'x-webx-acting-email').toLowerCase();
  const tenantKey = requestHeader(reqCtx, 'x-webx-acting-tenant');
  if (!email && !tenantKey) return null;
  if (String(reqCtx?.state?.user?.email || '').toLowerCase() !== SCHEDULER_EMAIL) return null;
  const tenant = email ? await adminTenantFor(strapi, email) : null;
  if (!tenant || tenant.key !== tenantKey) throw new errors.ForbiddenError('The acting user does not belong to this workspace.');
  const user = await strapi.db.query('admin::user').findOne({ where: { email }, populate: ['roles'] });
  if (!user || user.isActive === false) throw new errors.ForbiddenError('The acting user is not an active account.');
  return { email, tenant, user };
}

/** ล้างข้อมูล log/version/event ที่เก่ากว่า 90 วัน (กันตารางบวม) */
async function cleanupOldRecords(strapi: any) {
  const day = 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - 90 * day).toISOString();
  for (const uid of ['api::audit-log.audit-log', 'api::ab-event.ab-event', 'api::page-version.page-version', 'api::agent-thread.agent-thread']) {
    try { await strapi.db.query(uid).deleteMany({ where: { createdAt: { $lt: cutoff } } }); } catch (e) { /* noop */ }
  }
  // Agent jobs: finished jobs are kept 90 days; their checkpoints (the bulk of a row) only 7.
  try {
    const finished = { $in: ['done', 'failed', 'cancelled'] };
    const jobs = strapi.db.query('api::agent-job.agent-job');
    await jobs.deleteMany({ where: { runState: finished, finishedAt: { $lt: new Date(Date.now() - 90 * day) } } });
    await jobs.updateMany({ where: { runState: finished, finishedAt: { $lt: new Date(Date.now() - 7 * day) }, checkpoint: { $notNull: true } }, data: { checkpoint: null } });
  } catch (e) { /* noop */ }
  // Agent schedules: one that has been turned off is deleted 180 days later.
  try {
    await strapi.db.query('api::agent-schedule.agent-schedule').deleteMany({ where: { enabled: false, disabledAt: { $lt: new Date(Date.now() - 180 * day) } } });
  } catch (e) { /* noop */ }
}

// Scheduled-release publishing used to live here (processDueReleases, a
// setInterval below) — moved to webx-studio/lib/cms/governance.ts (Phase 5)
// so it can publish through whichever CmsAdapter a release's items actually
// belong to; this process's own document-service API can only ever reach
// Strapi content, so a WordPress-backed release item could never publish.
// Triggered externally now via POST /api/internal/releases/process-due on
// webx-studio, not by a timer in this process — see that route for why.

export default {
  /**
   * Document Service middleware — บังคับ scope ตาม tenant ใต้ชั้น validate ของ REST
   * ครอบคลุมทั้ง public API และหลังบ้าน (content-manager) ของ editor ที่สังกัด tenant
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    (strapi.documents as any).use(async (context: any, next: any) => {
      if (!SCOPED.has(context.uid)) return next();
      const action = context.action;
      const reqCtx: any = (strapi as any).requestContext?.get?.();
      const acting = await actingIdentity(strapi, reqCtx);
      const adminEmail = acting ? acting.email : reqCtx?.state?.user?.email;
      const adminUser = acting ? acting.user : reqCtx?.state?.user;
      const eff = acting ? acting.tenant : await effectiveTenant(strapi);
      context.params = context.params || {};

      // Custom-role action gate — deny before anything else runs. Super
      // admins never carry a customRoleAssignments entry to begin with
      // (they're not in any tenant's adminEmails), so this is naturally a
      // no-op for them without needing its own isSuperAdmin check.
      const crp = await resolveCustomRolePerms(strapi, eff, adminEmail, context.uid);
      if (crp) {
        const need = action === 'create' ? 'create' : action === 'update' ? 'update' : action === 'delete' ? 'delete'
          : (action === 'publish' || action === 'unpublish') ? 'publish' : null;
        if (need && !(crp as any)[need]) throw new errors.ForbiddenError('This custom role does not permit this action on this content type.');
      }

      if (eff) {
        // Single-document reads (findOne, by documentId) need an explicit
        // ownership check BEFORE falling through to the generic filter
        // merge below — found live writing this session's cross-tenant
        // e2e test (2026-09-12): content-manager's own findOne controller
        // correctly returns an EMPTY `data` for another tenant's document
        // once the filter below is merged in (confirmed: never leaks the
        // real title/body/PII fields), but still answers HTTP 200 instead
        // of 403/404, and its separate `meta.availableLocales` computation
        // does NOT go through the same filtered query — it leaks a
        // document's existence, timestamps, and a handful of schema fields
        // (confirmed harmless for the PII-bearing types, none of which have
        // draftAndPublish enabled, but real for any draftAndPublish type).
        // Throwing here closes both: no meta computation ever runs, and the
        // caller gets a real 403 instead of a misleadingly-empty 200.
        if (context.params.documentId && READS.has(action)) {
          const docId = context.params.documentId;
          const existing = await strapi.db.query(context.uid).findOne({ where: { documentId: docId }, populate: { tenant: true } });
          const owner = existing?.tenant?.key;
          if (owner && owner !== eff.key) {
            throw new errors.ForbiddenError('ไม่มีสิทธิ์เข้าถึงข้อมูลของหน่วยงานอื่น (cross-tenant)');
          }
        }
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
      }

      // Field-level RBAC — strip ฟิลด์ที่ role นี้ห้ามเขียน ก่อนบันทึกจริง
      if ((action === 'create' || action === 'update') && adminEmail && context.params?.data) {
        try { context.params.data = await stripPolicyFields(strapi, adminUser, context.uid, context.params.data); } catch (e) { /* fail-open */ }
        if (crp && (crp.hidden.length || crp.readonly.length)) {
          const forbidden = new Set<string>([...crp.hidden, ...crp.readonly]);
          const out: any = {};
          for (const k of Object.keys(context.params.data)) if (!forbidden.has(k)) out[k] = context.params.data[k];
          context.params.data = out;
        }
      }

      const result = await next();

      // Audit Log — บันทึกการเขียนของผู้ดูแลหลังบ้าน (รวม super admin)
      // ข้ามการเขียนตรงนี้ถ้าเรียกผ่าน WebX (webx-studio/lib/cms/governance.ts เขียน
      // audit row ของตัวเองแล้ว หลัง action สำเร็จ) — กันไม่ให้บันทึกซ้ำสอง row ต่อ
      // การกระทำเดียว การเขียนตรงจาก Strapi admin panel (ไม่มี header นี้) ยังถูก
      // บันทึกที่นี่ตามเดิม เป็น backstop ครอบคลุมเส้นทางที่ข้าม WebX
      const governedByWebx = (reqCtx?.get ? reqCtx.get('x-webx-governed') : reqCtx?.request?.header?.['x-webx-governed']) === '1';
      if (adminEmail && WRITE_ACTIONS.has(action) && !governedByWebx) {
        try {
          await strapi.db.query('api::audit-log.audit-log').create({
            data: {
              action, contentType: context.uid,
              entryId: (result && result.documentId) || context.params.documentId || null,
              adminEmail, tenantKey: eff ? eff.key : null, at: new Date(),
            },
          });
        } catch (e) { /* ไม่ให้ audit ล้มแล้วกระทบงานหลัก */ }
      }
      return result;
    });
  },

  /**
   * Bootstrap — locale ไทย, tenants, seed เนื้อหา, backfill, editor accounts, สิทธิ์ public
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    try {
      await ensureThaiLocale(strapi);
      await seedTenants(strapi);
      await seedOrstRoyalSocietyTenants(strapi);
      await seedContent(strapi);
      await seedJobs(strapi);
      await seedOrstRoyalSocietyJobs(strapi);
      await seedDemos(strapi);
      await backfillTenant(strapi);
      await seedLanding(strapi);
      await seedGroupA(strapi);
      await enrichGroupB(strapi);
      await seedCmsCore(strapi);
      await seedTenantBContent(strapi);
      await seedFlatNavItems(strapi);
      await seedModules(strapi);
      await seedCollectionPages(strapi);
      await seedFormPages(strapi);
      await seedFulltextDemo(strapi);
      await ensureTenantAnalytics(strapi);
      await ensureTenantLiveChat(strapi);
      await seedEditors(strapi);
      await seedScheduler(strapi);
      await grantLocalesToEditorRoles(strapi);
      await ensureEditorPublishPermissions(strapi);
      await ensurePageBuilderEditorPermissions(strapi);
      await ensureBlockTypeFieldPermissions(strapi);
      await ensurePublicPermissions(strapi);
    } catch (err) {
      strapi.log.error('[bootstrap] seed/setup failed: ' + (err as Error).stack);
    }
    // housekeeping: ล้าง log/version เก่า ตอนบูตและทุก 6 ชั่วโมง
    cleanupOldRecords(strapi).catch(() => {});
    setInterval(() => { cleanupOldRecords(strapi).catch(() => {}); }, 6 * 60 * 60 * 1000);
  },
};
