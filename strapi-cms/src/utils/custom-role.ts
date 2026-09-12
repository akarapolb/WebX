// Custom-role resolution — extracted out of src/index.ts's own write hook so
// the new /api/internal/custom-role-permissions route (called by the
// WordPress enforcement mu-plugin, which has no in-process way to read this
// data) can reuse the exact same logic instead of a third reimplementation
// alongside webx-studio/lib/cms/governance.ts's own TS-side copy.

/** แคช email(admin/editor) → tenant สำหรับ per-tenant RBAC หลังบ้าน */
let adminCache: { at: number; map: Map<string, { key: string; id: number; customRoleAssignments: Record<string, string> }> } = { at: 0, map: new Map() };
export async function adminTenantFor(strapi: any, email: string) {
  const now = Date.now();
  if (now - adminCache.at > 30000 || adminCache.map.size === 0) {
    const list = await strapi.db.query('api::tenant.tenant').findMany({ select: ['id', 'key', 'adminEmails', 'customRoleAssignments'], limit: 500 });
    const m = new Map<string, { key: string; id: number; customRoleAssignments: Record<string, string> }>();
    list.forEach((t: any) => (t.adminEmails || []).forEach((e: string) => m.set(String(e).toLowerCase(), { key: t.key, id: t.id, customRoleAssignments: t.customRoleAssignments || {} })));
    adminCache = { at: now, map: m };
  }
  return adminCache.map.get(String(email).toLowerCase()) || null;
}

/** Custom-role enforcement — mirrors webx-studio's own
 * resolveCustomRolePermissions()/stripCustomRoleFields(), so a write that
 * reaches Strapi directly (bypassing webx-studio entirely) is governed the
 * same way, same reasoning as field-policy's own dual enforcement. */
let customRoleCache: { at: number; list: any[] } = { at: 0, list: [] };
export async function getCustomRoles(strapi: any) {
  const now = Date.now();
  if (now - customRoleCache.at > 15000) {
    try { customRoleCache = { at: now, list: await strapi.db.query('api::custom-role.custom-role').findMany({ limit: 500 }) }; }
    catch { customRoleCache = { at: now, list: [] }; }
  }
  return customRoleCache.list;
}

export async function resolveCustomRolePerms(strapi: any, eff: any, adminEmail: string | undefined, uid: string) {
  if (!eff || !adminEmail) return null;
  const roleKey = (eff.customRoleAssignments || {})[String(adminEmail).toLowerCase()];
  if (!roleKey) return null;
  const roles = await getCustomRoles(strapi);
  const role = roles.find((r: any) => r.tenantKey === eff.key && r.roleKey === roleKey);
  if (!role) {
    // Same fix as governance.ts's own mirrored resolver (2026-09-12 audit):
    // an assigned role that no longer exists used to fail OPEN (no gate
    // applied, native admin role governs) — deleting a restrictive role is
    // a natural "revoke access" action, so that silently expanded rather
    // than restricted. Fail closed instead.
    return { create: false, update: false, delete: false, publish: false, hidden: [], readonly: [] };
  }
  const perm = (role.permissions || {})[uid] || {};
  return {
    create: Boolean(perm.create), update: Boolean(perm.update), delete: Boolean(perm.delete), publish: Boolean(perm.publish),
    hidden: Array.isArray(perm.hidden) ? perm.hidden : [], readonly: Array.isArray(perm.readonly) ? perm.readonly : [],
  };
}
