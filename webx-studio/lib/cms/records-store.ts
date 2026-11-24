// Bookkeeping records in the WebX control plane (docs/target-architecture.md,
// track C3): page templates and page versions. governance.ts
// reads and writes them through a CmsAdapter, so this is one: entries.list /
// get / create / update / remove against webx-control's /internal/records/<collection>.
//
// Switched on by the same two variables as the audit log (WEBX_CONTROL_URL and
// WEBX_CONTROL_SERVICE_TOKEN). Until then these stay in Strapi, as before.
//
// No "server-only" import: it is plain fetch, so tests can load it.
import type { CmsAdapter, EntryList, EntryQuery } from "./types";
import { CmsError } from "./types";
import { auditQueryString, type ControlAuditConfig } from "./audit-store";

/** The content types served by the control plane, by uid -> its collection name there.
 * Custom roles are NOT here yet although webx-control can store them: Strapi's own
 * enforcement and the WordPress mu-plugin read them from Strapi (strapi-cms/src/utils/
 * custom-role.ts), so moving them first would leave those two enforcing stale roles.
 * They move once that lookup is served from here. */
export const CONTROL_RECORD_COLLECTIONS: Record<string, string> = {
  "api::page-template.page-template": "page-template",
  "api::page-version.page-version": "page-version",
};

export function createControlRecordsAdapter(cfg: ControlAuditConfig): CmsAdapter {
  const collectionOf = (uid: string): string => {
    const c = CONTROL_RECORD_COLLECTIONS[uid];
    if (!c) throw new CmsError(`${uid} is not stored in the control plane`, 501);
    return c;
  };
  async function call(method: string, path: string, body?: unknown): Promise<any> {
    const r = await fetch(`${cfg.baseUrl}/internal/records/${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    let j: any = null;
    try { j = await r.json(); } catch { /* empty or non-JSON body */ }
    if (!r.ok) throw new CmsError(j?.error?.message ? `records ${method} failed: ${j.error.message}` : `records ${method} failed`, r.status);
    return j;
  }
  const unsupported = (what: string) => (): never => { throw new CmsError(`${what} is not part of the control plane's records`, 501); };

  return {
    schema: { listContentTypes: unsupported("the content type list") },
    entries: {
      async list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>> {
        const j = await call("GET", collectionOf(uid) + auditQueryString(query));
        const rows: T[] = j.data ?? [];
        return { data: rows, total: j.meta?.pagination?.total ?? rows.length, pageCount: j.meta?.pagination?.pageCount ?? 1 };
      },
      async get<T = any>(uid: string, id: string): Promise<T | null> {
        return (await call("GET", `${collectionOf(uid)}/${encodeURIComponent(id)}`)).data as T;
      },
      async create<T = any>(uid: string, data: Record<string, any>): Promise<T> {
        return (await call("POST", collectionOf(uid), { data })).data as T;
      },
      async update<T = any>(uid: string, id: string, data: Record<string, any>): Promise<T> {
        return (await call("PUT", `${collectionOf(uid)}/${encodeURIComponent(id)}`, { data })).data as T;
      },
      async remove(uid: string, id: string): Promise<void> {
        await call("DELETE", `${collectionOf(uid)}/${encodeURIComponent(id)}`);
      },
    },
    publish: { publish: unsupported("publishing"), unpublish: unsupported("publishing") },
    media: { upload: unsupported("media"), list: unsupported("media"), update: unsupported("media"), remove: unsupported("media") },
    auth: {
      me: unsupported("users"), listRoles: unsupported("users"), listUsers: unsupported("users"),
      findUserByEmail: unsupported("users"), create: unsupported("users"), remove: unsupported("users"),
    },
  };
}
