// CmsAdapter for the Rust engine's write API (rust-engine/, README "Write API",
// docs/engine-contract.md section 8). Content only: schema, entries, publish.
// Media and users are not in the engine yet (R4, and identity in the control
// plane, C2), so those calls refuse with 501 instead of pretending.
//
// The engine scopes every call to the tenant of the bearer token, so there is
// one adapter per tenant. `token` is a function so the caller can fetch it
// from wherever tenant credentials live when the call is made.
import type { CmsAdapter, ContentTypeInfo, EntryList, EntryQuery } from "./types";
import { CmsError } from "./types";

export type RustAdapterConfig = {
  /** e.g. http://localhost:1338 (the engine started with --db) */
  baseUrl: string;
  /** a token from `webx-read-engine token --tenant <key>` */
  token: () => string | Promise<string>;
};

export function createRustAdapter(cfg: RustAdapterConfig): CmsAdapter {
  const base = cfg.baseUrl.replace(/\/$/, "");
  let types: Promise<ContentTypeInfo[]> | undefined;

  async function call(method: string, path: string, body?: unknown): Promise<any> {
    const r = await fetch(`${base}/write/${path}`, {
      method,
      headers: { Authorization: `Bearer ${await cfg.token()}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    let j: any = null;
    try { j = await r.json(); } catch { /* an empty or non-JSON body */ }
    if (!r.ok) throw new CmsError(j?.error?.message ? `${method} ${path} failed: ${j.error.message}` : `${method} ${path} failed`, r.status);
    return j;
  }

  async function listTypes(): Promise<ContentTypeInfo[]> {
    types ??= call("GET", "_types").then((j) => (j.data as ContentTypeInfo[]).sort((a, b) => a.name.localeCompare(b.name)));
    try { return await types; } catch (e) { types = undefined; throw e; }
  }
  async function plural(uid: string): Promise<string> {
    const t = (await listTypes()).find((x) => x.uid === uid);
    if (!t) throw new CmsError(`unknown content type ${uid}`, 404);
    return t.pluralName;
  }
  const loc = (opts?: { locale?: string }) => (opts?.locale ? `?locale=${encodeURIComponent(opts.locale)}` : "");

  function queryString(q?: EntryQuery): string {
    if (!q) return "";
    const parts: string[] = [];
    if (q.page != null) parts.push("page=" + q.page);
    if (q.pageSize != null) parts.push("pageSize=" + q.pageSize);
    if (q.sort) parts.push("sort=" + q.sort);
    if (q.status) parts.push("status=" + q.status);
    if (q.q && q.q.trim()) parts.push("_q=" + encodeURIComponent(q.q.trim()));
    if (q.locale) parts.push("locale=" + encodeURIComponent(q.locale));
    for (const f of q.filter || []) {
      const path = f.field.split(".").map((seg) => "[" + seg + "]").join("");
      parts.push("filters" + path + "[$" + f.op + "]=" + encodeURIComponent(String(f.value)));
    }
    return parts.length ? "?" + parts.join("&") : "";
  }

  const unsupported = (what: string) => (): never => {
    throw new CmsError(`${what} is not available on the Rust engine yet`, 501);
  };

  return {
    schema: { listContentTypes: listTypes },
    entries: {
      async list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>> {
        const j = await call("GET", (await plural(uid)) + queryString(query));
        const rows: T[] = j.data ?? [];
        return { data: rows, total: j.meta?.pagination?.total ?? rows.length, pageCount: j.meta?.pagination?.pageCount ?? 1 };
      },
      async get<T = any>(uid: string, id: string, opts?: { locale?: string }): Promise<T | null> {
        const j = await call("GET", `${await plural(uid)}/${encodeURIComponent(id)}${loc(opts)}`);
        return (j.data as T | null) ?? null;
      },
      async create<T = any>(uid: string, data: Record<string, any>, opts?: { locale?: string }): Promise<T> {
        return (await call("POST", `${await plural(uid)}${loc(opts)}`, { data })).data as T;
      },
      async update<T = any>(uid: string, id: string, data: Record<string, any>, opts?: { locale?: string }): Promise<T> {
        return (await call("PUT", `${await plural(uid)}/${encodeURIComponent(id)}${loc(opts)}`, { data })).data as T;
      },
      async remove(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
        await call("DELETE", `${await plural(uid)}/${encodeURIComponent(id)}${loc(opts)}`);
      },
    },
    publish: {
      async publish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
        await call("POST", `${await plural(uid)}/${encodeURIComponent(id)}/publish${loc(opts)}`);
      },
      async unpublish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
        await call("POST", `${await plural(uid)}/${encodeURIComponent(id)}/unpublish${loc(opts)}`);
      },
    },
    media: {
      upload: unsupported("media upload"),
      list: unsupported("the media library"),
      update: unsupported("media editing"),
      remove: unsupported("media removal"),
    },
    auth: {
      me: unsupported("sign-in against the engine (identity is in the control plane)"),
      listRoles: unsupported("roles"),
      listUsers: unsupported("users"),
      findUserByEmail: unsupported("users"),
      create: unsupported("user creation"),
      remove: unsupported("user removal"),
    },
  };
}
