/**
 * internal controller — narrow, secret-protected lookups for webx-studio's
 * server-side governance layer (webx-studio/lib/cms/governance.ts).
 *
 * Why this exists: governance.ts's cross-tenant write guard needs to see an
 * entry's TRUE tenant owner even when that entry belongs to a different
 * tenant than the caller — but the normal admin content-manager API is
 * scoped by this same app's own documents.use() hook (src/index.ts), which
 * hides cross-tenant rows from a caller entirely. This endpoint does exactly
 * the same direct DB lookup the hook itself already does for its own
 * cross-tenant check (see GUARDED handling in src/index.ts), so the two
 * checks agree by construction. Auth is a shared secret, not an admin
 * session — this is a service-to-service call, not a user action.
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
};
