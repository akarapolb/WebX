// The audit log in the WebX control plane (docs/target-architecture.md, track
// C3). governance.ts reads and writes audit rows through a CmsAdapter, so this
// is one: entries.create / list / get against webx-control's /internal/audit,
// and nothing else. The log is append-only, so update and remove refuse.
//
// Switched on by WEBX_CONTROL_URL and WEBX_CONTROL_SERVICE_TOKEN (both). Until
// then governance keeps writing audit rows to Strapi, as before.
//
// No "server-only" import: it is plain fetch, so tests can load it.
import type { CmsAdapter, EntryList, EntryQuery } from "./types";
import { CmsError } from "./types";

export type ControlAuditConfig = { baseUrl: string; token: string };

/** The control plane's address and service token, or null when audit stays in Strapi. */
export function controlAuditConfig(env: Record<string, string | undefined> = process.env): ControlAuditConfig | null {
  const baseUrl = (env.WEBX_CONTROL_URL || "").replace(/\/$/, "");
  const token = env.WEBX_CONTROL_SERVICE_TOKEN || "";
  return baseUrl && token ? { baseUrl, token } : null;
}

/** EntryQuery -> webx-control's query string: filter=field:op:value, sort=field:dir, q, page, pageSize. */
export function auditQueryString(q?: EntryQuery): string {
  const p: string[] = [];
  for (const f of q?.filter || []) p.push("filter=" + encodeURIComponent(`${f.field}:${f.op}:${f.value}`));
  if (q?.sort) p.push("sort=" + encodeURIComponent(q.sort));
  if (q?.q && q.q.trim()) p.push("q=" + encodeURIComponent(q.q.trim()));
  if (q?.page != null) p.push("page=" + q.page);
  if (q?.pageSize != null) p.push("pageSize=" + q.pageSize);
  return p.length ? "?" + p.join("&") : "";
}

export function createControlAuditAdapter(cfg: ControlAuditConfig): CmsAdapter {
  async function call(method: string, path: string, body?: unknown): Promise<any> {
    const r = await fetch(`${cfg.baseUrl}/internal/${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    let j: any = null;
    try { j = await r.json(); } catch { /* empty or non-JSON body */ }
    if (!r.ok) throw new CmsError(j?.error?.message ? `audit ${method} failed: ${j.error.message}` : `audit ${method} failed`, r.status);
    return j;
  }
  const refuse = (what: string) => (): never => { throw new CmsError(`The audit log is append-only: ${what} is not allowed`, 405); };
  const unsupported = (what: string) => (): never => { throw new CmsError(`${what} is not part of the audit store`, 501); };

  return {
    schema: { listContentTypes: unsupported("the content type list") },
    entries: {
      async list<T = any>(_uid: string, query?: EntryQuery): Promise<EntryList<T>> {
        const j = await call("GET", "audit" + auditQueryString(query));
        const rows: T[] = j.data ?? [];
        return { data: rows, total: j.meta?.pagination?.total ?? rows.length, pageCount: j.meta?.pagination?.pageCount ?? 1 };
      },
      async get<T = any>(_uid: string, id: string): Promise<T | null> {
        return (await call("GET", "audit/" + encodeURIComponent(id))).data as T;
      },
      async create<T = any>(_uid: string, data: Record<string, any>): Promise<T> {
        return (await call("POST", "audit", { data })).data as T;
      },
      update: refuse("editing a row"),
      remove: refuse("deleting a row"),
    },
    publish: { publish: unsupported("publishing"), unpublish: unsupported("publishing") },
    media: { upload: unsupported("media"), list: unsupported("media"), update: unsupported("media"), remove: unsupported("media") },
    auth: {
      me: unsupported("users"), listRoles: unsupported("users"), listUsers: unsupported("users"),
      findUserByEmail: unsupported("users"), create: unsupported("users"), remove: unsupported("users"),
    },
  };
}
