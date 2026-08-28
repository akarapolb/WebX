import { adminTenantFor, resolveCustomRolePerms } from '../../../utils/custom-role';

/**
 * internal controller — narrow, secret-protected lookups for webx-studio's
 * server-side governance layer (webx-studio/lib/cms/governance.ts) and for
 * the WordPress custom-role enforcement mu-plugin (wordpress/mu-plugins/
 * custom-role-enforcement.php), neither of which can see this data
 * in-process the way src/index.ts's own write hook can.
 *
 * Why tenantOf exists: governance.ts's cross-tenant write guard needs to see
 * an entry's TRUE tenant owner even when that entry belongs to a different
 * tenant than the caller — but the normal admin content-manager API is
 * scoped by this same app's own documents.use() hook (src/index.ts), which
 * hides cross-tenant rows from a caller entirely. This endpoint does exactly
 * the same direct DB lookup the hook itself already does for its own
 * cross-tenant check (see GUARDED handling in src/index.ts), so the two
 * checks agree by construction. Auth is a shared secret, not an admin
 * session — these are service-to-service calls, not user actions.
 */
export default {
  async tenantOf(ctx: any) {
    const strapi = (global as any).strapi;
    const secret = process.env.WEBX_INTERNAL_SECRET;
    if (!secret || ctx.request.header['x-internal-secret'] !== secret) {
      ctx.status = 401; ctx.body = { error: 'unauthorized' }; return;
    }
    const uid = ctx.query.uid;
    const id = ctx.query.id;
    if (!uid || !id) { ctx.status = 400; ctx.body = { error: 'uid and id required' }; return; }
    try {
      const row = await strapi.db.query(uid).findOne({ where: { documentId: id }, populate: { tenant: true } });
      ctx.body = { tenant: row?.tenant ? { key: row.tenant.key, id: row.tenant.id } : null };
    } catch (e) {
      ctx.status = 404; ctx.body = { error: 'not found' };
    }
  },

  /**
   * Custom-role permission resolver for direct (non-webx-mediated) writes.
   * Deliberately takes only email+uid, NOT a caller-supplied tenantKey —
   * tenant is resolved server-side from the email's own
   * Tenant.adminEmails/customRoleAssignments membership, the same way this
   * app's own documents.use() hook resolves it for an admin session. A
   * caller-supplied tenantKey would let an attacker who holds a permissive
   * custom role in one tenant use it to authorize a write into another.
   */
  async customRolePermissions(ctx: any) {
    const strapi = (global as any).strapi;
    const secret = process.env.WEBX_INTERNAL_SECRET;
    if (!secret || ctx.request.header['x-internal-secret'] !== secret) {
      ctx.status = 401; ctx.body = { error: 'unauthorized' }; return;
    }
    const email = String(ctx.query.email || '').toLowerCase();
    const uid = String(ctx.query.uid || '');
    if (!email || !uid) { ctx.status = 400; ctx.body = { error: 'email and uid required' }; return; }

    const eff = await adminTenantFor(strapi, email);
    if (!eff) { ctx.body = { tenantKey: null, hasCustomRole: false }; return; }

    const perms = await resolveCustomRolePerms(strapi, eff, email, uid);
    if (!perms) { ctx.body = { tenantKey: eff.key, hasCustomRole: false }; return; }
    ctx.body = { tenantKey: eff.key, hasCustomRole: true, ...perms };
  },
};
