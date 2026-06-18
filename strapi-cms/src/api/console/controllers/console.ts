/**
 * console controller — บริการสำหรับ WebX Console (หลังบ้านรวมศูนย์ต่อ tenant)
 * ทุก endpoint ป้องกันด้วย policy global::admin-only (ctx.state.adminUser ถูกตั้งโดย policy)
 *
 * context : คืนข้อมูลผู้ล็อกอิน + รายการ tenant ที่เข้าถึงได้ (super admin = ทุก tenant,
 *           editor = เฉพาะ tenant ที่อีเมลอยู่ใน adminEmails) พร้อมแบรนด์ของแต่ละ tenant
 */
const lc = (s: any) => String(s || '').toLowerCase();

async function isSuperAdmin(strapi: any, adminId: number) {
  try {
    const full = await strapi.db.query('admin::user').findOne({ where: { id: adminId }, populate: { roles: true } });
    return (full?.roles || []).some((r: any) => r.code === 'strapi-super-admin');
  } catch { return false; }
}

export default {
  /**
   * SSO bridge — หน้าเชื่อมล็อกอินเข้า Strapi Admin โดยไม่ต้องล็อกอินซ้ำ
   * รับ token ผ่าน URL fragment (#token=...) ซึ่ง "ไม่ถูกส่งขึ้น server" (ไม่ขึ้น log)
   * ฝั่ง client เขียน token ลง localStorage ของ origin :1337 (คีย์เดียวกับที่ admin ใช้)
   * แล้ว redirect ไปยังหน้า /admin ที่ขอ — จำกัด redirect ให้เป็น /admin เท่านั้น (กัน open-redirect)
   */
  async ssoBridge(ctx: any) {
    // CSP ของ Strapi (helmet) บล็อก inline script (script-src 'self') แต่อนุญาต external same-origin
    // → โหลด logic จาก /api/sso/bridge.js (origin เดียวกัน) เพื่อให้รันได้
    ctx.type = 'text/html';
    ctx.body = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="robots" content="noindex,nofollow"><title>กำลังเข้าสู่ระบบ…</title>
<style>body{font-family:'Kanit',system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#334;background:#fafaf8}</style>
</head><body><div>กำลังเข้าสู่ระบบจัดการเนื้อหา…</div>
<script src="/api/sso/bridge.js"></script></body></html>`;
  },

  /** สคริปต์ของ SSO bridge (เสิร์ฟ same-origin เพื่อผ่าน CSP script-src 'self') */
  async ssoBridgeJs(ctx: any) {
    ctx.type = 'application/javascript';
    ctx.body = `(function(){try{
var p=new URLSearchParams(location.hash.slice(1));
var token=p.get('token'),redirect=p.get('redirect')||'/admin';
if(!/^\\/admin(\\/|$|\\?|#)/.test(redirect))redirect='/admin';
if(token){localStorage.setItem('jwtToken',JSON.stringify(token));localStorage.setItem('isLoggedIn','true');}
location.replace(redirect);
}catch(e){location.replace('/admin');}})();`;
  },

  async context(ctx: any) {
    const strapi = (global as any).strapi;
    const admin = ctx.state.adminUser || {};
    const email = lc(admin.email);
    const sup = await isSuperAdmin(strapi, admin.id);

    const all = await strapi.db.query('api::tenant.tenant')
      .findMany({ select: ['key', 'name', 'adminEmails', 'brand', 'template', 'watermark', 'liveChat'], limit: 200 }).catch(() => []);
    const mine = all.filter((t: any) => (t.adminEmails || []).map(lc).includes(email));
    const allowed = sup ? all : mine;

    ctx.body = {
      admin: { email: admin.email, firstname: admin.firstname || '', isSuper: sup },
      tenants: allowed.map((t: any) => ({ key: t.key, name: t.name, brand: t.brand || {}, template: t.template || {}, watermark: t.watermark || {}, liveChat: t.liveChat || {} })),
    };
  },

  /** อัปเดตแบรนด์/เทมเพลต/ลายน้ำ ของ tenant (super=ตาม ?tenant, editor=ของตนเอง) */
  async updateBranding(ctx: any) {
    const strapi = (global as any).strapi;
    const admin = ctx.state.adminUser || {};
    const email = lc(admin.email);
    const sup = await isSuperAdmin(strapi, admin.id);
    const body = ctx.request.body || {};
    const all = await strapi.db.query('api::tenant.tenant')
      .findMany({ select: ['id', 'key', 'adminEmails', 'brand', 'template', 'watermark', 'liveChat'], limit: 200 }).catch(() => []);
    let target: any;
    if (sup) { const k = lc(ctx.query.tenant); target = all.find((t: any) => t.key === k); }
    else { target = all.find((t: any) => (t.adminEmails || []).map(lc).includes(email)); }
    if (!target) { ctx.status = 403; ctx.body = { error: 'ไม่พบหน่วยงานที่มีสิทธิ์แก้ไข' }; return; }
    const data: any = {};
    if (body.brand) data.brand = { ...(target.brand || {}), ...body.brand };
    if (body.template) data.template = { ...(target.template || {}), ...body.template };
    if (body.watermark) data.watermark = { ...(target.watermark || {}), ...body.watermark };
    if (body.liveChat) data.liveChat = body.liveChat; // แทนที่ทั้งก้อน (รายการช่องทาง)
    if (!Object.keys(data).length) { ctx.status = 400; ctx.body = { error: 'ไม่มีข้อมูลให้อัปเดต' }; return; }
    await strapi.db.query('api::tenant.tenant').update({ where: { id: target.id }, data });
    ctx.body = { ok: true, tenant: target.key, brand: data.brand, template: data.template, watermark: data.watermark, liveChat: data.liveChat };
  },

  /** ส่งออกข้อมูลฟอร์มเป็น Excel (TOR ข้อ 17.9) — admin-only, scope ตาม tenant */
  async exportData(ctx: any) {
    const strapi = (global as any).strapi;
    const XLSX = require('xlsx');
    const MAP: Record<string, string> = {
      application: 'api::application.application',
      complaint: 'api::complaint.complaint',
      registration: 'api::registration.registration',
      contact: 'api::contact-message.contact-message',
    };
    const type = String(ctx.query.type || 'application');
    const uid = MAP[type];
    if (!uid) { ctx.status = 400; ctx.body = { error: 'ชนิดข้อมูลไม่ถูกต้อง' }; return; }
    const tenantId = ctx.state?.tenantId;
    const where = tenantId ? { tenant: tenantId } : {};
    const rows = await strapi.db.query(uid).findMany({ where, limit: 10000, orderBy: { id: 'desc' } });
    const clean = rows.map((r: any) => {
      const o: any = { ...r };
      delete o.id; delete o.documentId; delete o.tenant; delete o.createdById; delete o.updatedById; delete o.locale;
      if (o.steps) o.steps = undefined;
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(clean);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', `attachment; filename="${type}-${tenantId || 'all'}.xlsx"`);
    ctx.body = buf;
  },

  /** รายชื่อผู้ดูแล (admin users) + อีเมลที่เป็นผู้ดูแลของ tenant นั้น */
  async users(ctx: any) {
    const strapi = (global as any).strapi;
    const admin = ctx.state.adminUser || {};
    const email = lc(admin.email);
    const sup = await isSuperAdmin(strapi, admin.id);
    const all = await strapi.db.query('api::tenant.tenant').findMany({ select: ['key', 'name', 'adminEmails'], limit: 200 }).catch(() => []);
    let target: any;
    if (sup) { const k = lc(ctx.query.tenant); target = all.find((t: any) => t.key === k); }
    else { target = all.find((t: any) => (t.adminEmails || []).map(lc).includes(email)); }
    if (!target) { ctx.status = 403; ctx.body = { error: 'ไม่พบหน่วยงานที่มีสิทธิ์' }; return; }
    const users = await strapi.db.query('admin::user').findMany({
      select: ['id', 'firstname', 'lastname', 'email', 'isActive', 'blocked'],
      populate: { roles: { select: ['name', 'code'] } }, limit: 500,
    }).catch(() => []);
    ctx.body = {
      tenant: { key: target.key, name: target.name, adminEmails: target.adminEmails || [] },
      isSuper: sup,
      users: users.map((u: any) => ({
        email: u.email, name: ((u.firstname || '') + ' ' + (u.lastname || '')).trim(),
        active: u.isActive !== false && u.blocked !== true,
        roles: (u.roles || []).map((r: any) => r.name).join(', '),
        isSuper: (u.roles || []).some((r: any) => r.code === 'strapi-super-admin'),
      })),
    };
  },

  /** ตั้งรายชื่อผู้ดูแลเนื้อหาของ tenant (adminEmails = per-tenant RBAC) */
  async updateUsers(ctx: any) {
    const strapi = (global as any).strapi;
    const admin = ctx.state.adminUser || {};
    const email = lc(admin.email);
    const sup = await isSuperAdmin(strapi, admin.id);
    const body = ctx.request.body || {};
    if (!Array.isArray(body.adminEmails)) { ctx.status = 400; ctx.body = { error: 'adminEmails ต้องเป็นรายการ' }; return; }
    const all = await strapi.db.query('api::tenant.tenant').findMany({ select: ['id', 'key', 'adminEmails'], limit: 200 }).catch(() => []);
    let target: any;
    if (sup) { const k = lc(ctx.query.tenant); target = all.find((t: any) => t.key === k); }
    else { target = all.find((t: any) => (t.adminEmails || []).map(lc).includes(email)); }
    if (!target) { ctx.status = 403; ctx.body = { error: 'ไม่พบหน่วยงานที่มีสิทธิ์แก้ไข' }; return; }
    const clean = Array.from(new Set(body.adminEmails.map((e: any) => String(e).trim()).filter(Boolean)));
    await strapi.db.query('api::tenant.tenant').update({ where: { id: target.id }, data: { adminEmails: clean } });
    ctx.body = { ok: true, tenant: target.key, adminEmails: clean };
  },
};
