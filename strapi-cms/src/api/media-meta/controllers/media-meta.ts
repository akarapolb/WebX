// Media library gap (TOR — search/tag/reuse/crop/caption). Custom API for
// the ONE thing the stock Upload plugin's own routes can't do:
//
//   - GET /upload/files (its real, working list endpoint) doesn't apply
//     any tenant scoping — this repo's usual src/index.ts document-service
//     middleware never fires for it, because @strapi/upload's own
//     controller/service call strapi.db.query(FILE_MODEL_UID) directly,
//     never strapi.documents(uid) (confirmed in its dist source). A
//     centralized media library that showed every OTHER tenant's uploads
//     would be a real data-isolation bug, not a cosmetic gap, so this
//     wraps that same query with explicit tenant filtering instead.
//   - POST /upload?id=X's `fileInfo` body only recognizes
//     name/caption/alternativeText (hardcoded in the plugin) — a custom
//     `tags` field (added via src/extensions/upload/content-types/file/
//     schema.json, alongside a `tenant` relation for the scoping above)
//     is silently dropped by that endpoint, confirmed live. This exposes
//     a real write path for both.
//
// Routes take `documentId` (matching every other Strapi v5 API in this
// project), not the raw numeric id — db.query()'s relation filters need
// the SAME `{ relation: { id } }` nested shape internal.ts's own
// tenant-of lookup already uses (a flat `{ tenant: id }` silently matches
// nothing, and a populate-less findOne() leaves `.tenant` undefined,
// which made an earlier version of this file's ownership check a no-op —
// found live, by successfully cross-tenant-editing another tenant's file).
import { adminTenantFor } from '../../../utils/custom-role';

const FILE_UID = 'plugin::upload.file';

async function callerTenant(ctx: any) {
  const email = ctx.state?.adminUser?.email;
  if (!email) return null;
  return adminTenantFor(strapi, email);
}

export default {
  async list(ctx: any) {
    const eff = await callerTenant(ctx);
    if (!eff) return ctx.forbidden('No tenant resolved for this admin account.');
    const search = String(ctx.query.search || '').trim();
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.pageSize) || 30));
    const where: any = { tenant: { id: eff.id } };
    if (search) {
      where.$or = [
        { name: { $containsi: search } },
        { caption: { $containsi: search } },
        { alternativeText: { $containsi: search } },
        { tags: { $containsi: search } },
      ];
    }
    const [total, results] = await Promise.all([
      strapi.db.query(FILE_UID).count({ where }),
      strapi.db.query(FILE_UID).findMany({ where, orderBy: { createdAt: 'desc' }, limit: pageSize, offset: (page - 1) * pageSize }),
    ]);
    ctx.body = { data: results, meta: { pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } } };
  },

  // Called both right after a stock /upload completes (claims tenant
  // ownership on first touch, since the file's `tenant` starts null) and
  // whenever the library's own edit panel saves caption/alt/tags.
  async update(ctx: any) {
    const eff = await callerTenant(ctx);
    if (!eff) return ctx.forbidden('No tenant resolved for this admin account.');
    const documentId = ctx.params.id;
    const existing: any = await strapi.db.query(FILE_UID).findOne({ where: { documentId }, populate: { tenant: true } });
    if (!existing) return ctx.notFound();
    if (existing.tenant && existing.tenant.id !== eff.id) return ctx.forbidden('This file belongs to another tenant.');
    const body = ctx.request.body || {};
    // `tenant: null` releases a file back to the unclaimed pool (an owner
    // undoing an accidental claim) — anything else, including omitting the
    // field, (re)stamps the caller's own tenant, same "claim on first
    // touch" as this handler's own top comment describes.
    const data: Record<string, any> = { tenant: body.tenant === null ? null : eff.id };
    // A field present as an explicit `null` clears it; omitted (undefined)
    // leaves the existing value untouched — a normal partial-update PATCH
    // semantic, just applied per-field since this is a plain object body.
    for (const key of ['caption', 'alternativeText', 'tags'] as const) {
      if (body[key] === null || typeof body[key] === 'string') data[key] = body[key];
    }
    const updated = await strapi.db.query(FILE_UID).update({ where: { documentId }, data });
    ctx.body = { data: updated };
  },

  async remove(ctx: any) {
    const eff = await callerTenant(ctx);
    if (!eff) return ctx.forbidden('No tenant resolved for this admin account.');
    const documentId = ctx.params.id;
    const existing: any = await strapi.db.query(FILE_UID).findOne({ where: { documentId }, populate: { tenant: true } });
    if (!existing) return ctx.notFound();
    if (existing.tenant && existing.tenant.id !== eff.id) return ctx.forbidden('This file belongs to another tenant.');
    // Delegate to the Upload plugin's own service for the delete (removes
    // the on-disk file + its generated format thumbnails too, not just the
    // DB row — strapi.db.query(...).delete() alone would leave orphans).
    await strapi.plugin('upload').service('upload').remove(existing);
    ctx.body = { data: { documentId } };
  },
};
