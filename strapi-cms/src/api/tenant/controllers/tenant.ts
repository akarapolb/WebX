import { factories } from '@strapi/strapi';

/**
 * Tenant controller — resolve: หา tenant จาก host/key แล้วคืนค่าตั้งค่าสาธารณะ
 * (แบรนด์/ติดต่อ/social/footer) สำหรับให้หน้าเว็บนำไปแสดง
 */
export default factories.createCoreController('api::tenant.tenant', ({ strapi }) => ({
  async resolve(ctx) {
    const host = String(ctx.query.host || ctx.request.header.host || '').toLowerCase().split(':')[0];
    const key = String(ctx.query.tenant || ctx.request.header['x-tenant'] || '').toLowerCase();
    const all = await strapi.documents('api::tenant.tenant').findMany({ filters: { active: true }, limit: 100 });

    let t: any = null;
    if (key) t = all.find((x: any) => x.key === key);
    if (!t && host) t = all.find((x: any) => Array.isArray(x.domains) && x.domains.map((d: any) => String(d).toLowerCase()).includes(host));
    if (!t) t = all.find((x: any) => x.key === 'dga') || all[0];
    if (!t) return ctx.notFound('no tenant configured');

    ctx.body = {
      data: {
        key: t.key, name: t.name, brand: t.brand,
        contact: t.contact, social: t.social, footerColumns: t.footerColumns,
        analytics: t.analytics, liveChat: t.liveChat,
        template: t.template, watermark: t.watermark,
        engine: t.engine || 'strapi',
        publicTemplate: t.publicTemplate || 'gov-portal',
      },
    };
  },

  /** รายชื่อ tenant ที่ active ทั้งหมด (key + engine + publicTemplate เท่านั้น) —
   * สาธารณะ ใช้โดย public-site เพื่อรู้ว่ามี tenant อะไรบ้างสำหรับ
   * generateStaticParams() โดยไม่ต้องเผยข้อมูลอื่นของ tenant (Phase 6/8) */
  async keys(ctx: any) {
    const strapi = (global as any).strapi;
    const all = await strapi.db.query('api::tenant.tenant')
      .findMany({ where: { active: true }, select: ['key', 'engine', 'publicTemplate'], limit: 200 }).catch(() => []);
    ctx.body = { data: all.map((t: any) => ({ key: t.key, engine: t.engine || 'strapi', publicTemplate: t.publicTemplate || 'gov-portal' })) };
  },
}));
