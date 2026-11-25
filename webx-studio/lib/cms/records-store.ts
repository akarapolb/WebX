// Bookkeeping records in the WebX control plane (docs/target-architecture.md,
// track C3): page templates, page versions and the agent's threads. governance.ts
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
  // the agent's conversations (lib/agent/threads.ts): owner-scoped history that only Studio reads and writes
  "api::agent-thread.agent-thread": "agent-thread",
};

/** Content types the control plane holds that Studio only READS from there, next to the engine's own rows: what visitors'
 * browsers report. The public site writes them (POST /api/consent-logs and /api/search-stats/log, webx-control's
 * visitors routes), to the control plane once PUBLIC_CONTROL_URL points there and to the engine until then, so the screens
 * show both and nothing is migrated (lib/cms/consent-merge.ts, lib/cms/stat-merge.ts). They are NOT in
 * CONTROL_RECORD_COLLECTIONS: that map switches every read and write of a type, which would hide the engine's old rows. */
export const CONTROL_READ_COLLECTIONS: Record<string, string> = {
  "api::consent-log.consent-log": "consent-log",
  "api::search-stat.search-stat": "search-stat",
  // the form inboxes (lib/cms/form-merge.ts); changed and deleted where each submission lives, through the same adapter
  "api::complaint.complaint": "complaint",
  "api::application.application": "application",
  "api::registration.registration": "registration",
  "api::contact-message.contact-message": "contact-message",
};

/** A file the control plane keeps for a form (a complaint's attachment, an application's résumé), as the response it gives: the
 * bytes, with the workspace and form in `x-file-tenant` and `x-file-collection`. */
export async function fetchControlFile(cfg: ControlAuditConfig, id: string): Promise<Response> {
  return fetch(`${cfg.baseUrl}/internal/files/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${cfg.token}` }, cache: "no-store" });
}

export function createControlRecordsAdapter(cfg: ControlAuditConfig, collections: Record<string, string> = CONTROL_RECORD_COLLECTIONS): CmsAdapter {
  const collectionOf = (uid: string): string => {
    const c = collections[uid];
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
