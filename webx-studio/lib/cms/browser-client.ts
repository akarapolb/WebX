// Browser-safe CmsAdapter — fetches WebX's own governed /api/cms/* routes
// instead of talking to Strapi's shapes directly (that logic moved
// server-side into governance.ts + strapi.ts as of Phase 1). This is what
// components actually get from `cms` in lib/cms/index.ts.
import type {
  CmsAdapter, EntryQuery, EntryList, ContentTypeInfo, MediaAsset, CurrentUser, AdminUser,
} from "./types";
import { CmsError } from "./types";

const BASE = "/api/cms";

function buildListQuery(q?: EntryQuery): string {
  if (!q) return "";
  const parts: string[] = [];
  if (q.page != null) parts.push("page=" + q.page);
  if (q.pageSize != null) parts.push("pageSize=" + q.pageSize);
  if (q.sort) parts.push("sort=" + encodeURIComponent(q.sort));
  if (q.status) parts.push("status=" + q.status);
  if (q.q && q.q.trim()) parts.push("q=" + encodeURIComponent(q.q.trim()));
  if (q.filter && q.filter.length) parts.push("filter=" + encodeURIComponent(JSON.stringify(q.filter)));
  return parts.length ? "?" + parts.join("&") : "";
}

function localeQuery(opts?: { locale?: string }): string {
  return opts?.locale ? "?locale=" + encodeURIComponent(opts.locale) : "";
}

async function json(r: Response): Promise<any> {
  try { return await r.json(); } catch { return null; }
}

async function errorFrom(r: Response): Promise<CmsError> {
  const j = await json(r);
  return new CmsError(j?.error || (r.status + ""), r.status);
}

export const browserAdapter: CmsAdapter = {
  schema: {
    async listContentTypes(): Promise<ContentTypeInfo[]> {
      const r = await fetch(BASE + "/schema");
      if (!r.ok) throw await errorFrom(r);
      return (await json(r)) || [];
    },
  },

  entries: {
    async list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>> {
      const r = await fetch(BASE + "/entries/" + encodeURIComponent(uid) + buildListQuery(query));
      if (!r.ok) throw await errorFrom(r);
      return (await json(r)) || { data: [], total: 0, pageCount: 1 };
    },
    async get<T = any>(uid: string, id: string, opts?: { locale?: string }): Promise<T | null> {
      const r = await fetch(BASE + "/entries/" + encodeURIComponent(uid) + "/" + encodeURIComponent(id) + localeQuery(opts));
      if (!r.ok) throw await errorFrom(r);
      return await json(r);
    },
    async create<T = any>(uid: string, data: Record<string, any>): Promise<T> {
      const r = await fetch(BASE + "/entries/" + encodeURIComponent(uid), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw await errorFrom(r);
      return await json(r);
    },
    async update<T = any>(uid: string, id: string, data: Record<string, any>, opts?: { locale?: string }): Promise<T> {
      const r = await fetch(BASE + "/entries/" + encodeURIComponent(uid) + "/" + encodeURIComponent(id) + localeQuery(opts), {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw await errorFrom(r);
      return await json(r);
    },
    async remove(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
      const r = await fetch(BASE + "/entries/" + encodeURIComponent(uid) + "/" + encodeURIComponent(id) + localeQuery(opts), { method: "DELETE" });
      if (!r.ok) throw await errorFrom(r);
    },
  },

  publish: {
    async publish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
      const r = await fetch(BASE + "/entries/" + encodeURIComponent(uid) + "/" + encodeURIComponent(id) + "/publish" + localeQuery(opts), { method: "POST" });
      if (!r.ok) throw await errorFrom(r);
    },
    async unpublish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
      const r = await fetch(BASE + "/entries/" + encodeURIComponent(uid) + "/" + encodeURIComponent(id) + "/unpublish" + localeQuery(opts), { method: "POST" });
      if (!r.ok) throw await errorFrom(r);
    },
  },

  media: {
    // Uploads were never tenant/RBAC/audit-governed (plugin::upload.file
    // isn't in Strapi's SCOPED set), so this keeps going straight through
    // the existing byte-preserving pass-through rather than a new governed
    // route — nothing for governance.ts to add here.
    async upload(file: File): Promise<MediaAsset> {
      const fd = new FormData();
      fd.append("files", file);
      const r = await fetch("/api/strapi/upload", { method: "POST", body: fd });
      if (!r.ok) throw new CmsError("upload failed", r.status);
      const j = await json(r);
      const f = Array.isArray(j) ? j[0] : j;
      if (!f?.id) throw new Error("upload response missing id");
      return { id: f.id, url: f.url, mime: f.mime, name: f.name };
    },
  },

  auth: {
    async me(): Promise<CurrentUser | null> {
      const r = await fetch(BASE + "/auth/me");
      if (!r.ok) return null;
      return await json(r);
    },
    async listRoles(): Promise<{ id: any; name: string }[]> {
      const r = await fetch(BASE + "/auth/roles");
      if (!r.ok) return [];
      return (await json(r)) || [];
    },
    async listUsers(): Promise<AdminUser[]> {
      const r = await fetch(BASE + "/auth/users");
      if (!r.ok) throw await errorFrom(r);
      return (await json(r)) || [];
    },
  },
};
