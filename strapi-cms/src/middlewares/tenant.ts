/**
 * tenant middleware (HTTP) — resolve tenant ต่อ request แล้วเก็บไว้ที่ ctx.state
 *
 * รู้ tenant จาก (เรียงลำดับ): ?tenant=<key>  →  header X-Tenant  →  Host (custom domain)
 * การ "scope ข้อมูล" จริงทำที่ Document Service middleware (ดู src/index.ts register)
 * ซึ่งอยู่ใต้ชั้น validate ของ REST API จึงไม่ติด error "Invalid key tenant"
 * วาง middleware นี้ "หลัง" strapi::query ใน config/middlewares.ts (เพื่อให้อ่าน ctx.query ได้)
 */
let cache: { at: number; list: any[] } = { at: 0, list: [] };

/** Called from the tenant content-type's lifecycles (create/update/delete)
 * so a brand-new or just-edited tenant is visible immediately instead of
 * waiting out the 30s window below — see WebX-handoff-2026-09-11.md #1 for
 * the bug this fixes (a fresh signup's first request could resolve against
 * a stale, unrelated tenant's cached row). */
export function invalidateTenantCache(): void {
  cache = { at: 0, list: [] };
}

async function loadTenants(strapi: any): Promise<any[]> {
  const now = Date.now();
  if (now - cache.at < 30000 && cache.list.length) return cache.list;
  try {
    const list = await strapi.documents('api::tenant.tenant').findMany({
      filters: { active: true }, fields: ['key', 'domains'], limit: 500,
    });
    cache = { at: now, list };
    return list;
  } catch (e) {
    return cache.list;
  }
}

function pick(list: any[], ctx: any): any {
  const host = String(ctx.request.header.host || '').toLowerCase().split(':')[0];
  const key = String((ctx.query && ctx.query.tenant) || ctx.request.header['x-tenant'] || '').toLowerCase();
  let t: any = null;
  if (key) t = list.find((x) => x.key === key);
  if (!t && host) t = list.find((x) => Array.isArray(x.domains) && x.domains.map((d: any) => String(d).toLowerCase()).includes(host));
  if (!t) t = list.find((x) => x.key === 'dga') || list[0];
  return t || null;
}

export default (_config: any, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: any) => {
    const path = ctx.path || '';
    if (!path.startsWith('/api/')) return next();
    const list = await loadTenants(strapi);
    const tenant = list.length ? pick(list, ctx) : null;
    if (tenant) {
      ctx.state.tenantKey = tenant.key;
      ctx.state.tenantId = tenant.id;
    }
    return next();
  };
};
