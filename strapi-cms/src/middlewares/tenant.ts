/**
 * tenant middleware (HTTP) — resolve tenant ต่อ request แล้วเก็บไว้ที่ ctx.state
 *
 * รู้ tenant จาก (เรียงลำดับ): ?tenant=<key>  →  header X-Tenant  →  Host (custom domain)
 * การ "scope ข้อมูล" จริงทำที่ Document Service middleware (ดู src/index.ts register)
 * ซึ่งอยู่ใต้ชั้น validate ของ REST API จึงไม่ติด error "Invalid key tenant"
 * วาง middleware นี้ "หลัง" strapi::query ใน config/middlewares.ts (เพื่อให้อ่าน ctx.query ได้)
 *
 * Decision D9 (docs/target-architecture.md, engine-contract.md section 2): a request that names a tenant, by
 * ?tenant= or X-Tenant, gets that tenant or nothing. A key that no active tenant has is kept as the request's
 * tenant and marked unknown (ctx.state.tenantUnknown): it has no rows, so every list reads empty and anything
 * aimed at one document, or any write, is a 404 (src/index.ts). A typo never serves another organisation's
 * content. Only a request that names no tenant falls back: to a Host that matches a tenant's domains, then to
 * the default tenant.
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

/** The tenant a request is for, from the active tenants, the key it names (lower-cased; empty when it names
 * none) and its Host. `unknown` is the key when the request named a tenant that is not in the list. */
export function pickTenant(list: any[], key: string, host: string): { tenant: any | null; unknown?: string } {
  if (key) {
    const named = list.find((x) => x.key === key);
    return named ? { tenant: named } : { tenant: null, unknown: key };
  }
  let t: any = null;
  if (host) t = list.find((x) => Array.isArray(x.domains) && x.domains.map((d: any) => String(d).toLowerCase()).includes(host));
  if (!t) t = list.find((x) => x.key === 'dga') || list[0];
  return { tenant: t || null };
}

export default (_config: any, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: any) => {
    const path = ctx.path || '';
    if (!path.startsWith('/api/')) return next();
    const host = String(ctx.request.header.host || '').toLowerCase().split(':')[0];
    const key = String((ctx.query && ctx.query.tenant) || ctx.request.header['x-tenant'] || '').toLowerCase();
    const { tenant, unknown } = pickTenant(await loadTenants(strapi), key, host);
    if (tenant) {
      ctx.state.tenantKey = tenant.key;
      ctx.state.tenantId = tenant.id;
    } else if (unknown) {
      ctx.state.tenantKey = unknown;
      ctx.state.tenantId = null;
      ctx.state.tenantUnknown = true;
    }
    return next();
  };
};
