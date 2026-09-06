// Browser-safe CmsAdapter — fetches WebX's own governed /api/cms/* routes
// instead of talking to Strapi's shapes directly (that logic moved
// server-side into governance.ts + strapi.ts as of Phase 1). This is what
// components actually get from `cms` in lib/cms/index.ts.
import type {
  BrowserCmsAdapter, EntryQuery, EntryList, ContentTypeInfo, MediaAsset, MediaAssetList, CurrentUser, AdminUser, NewUserInput, RemoveUserResult,
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

export const browserAdapter: BrowserCmsAdapter = {
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
    // Media library gap (TOR — search/tag/reuse/crop/caption) — routes
    // through governed.media.* (via /api/cms/media) for BOTH engines now,
    // not the old Strapi-only /api/strapi/upload byte-pass-through: that
    // bypassed governance entirely (uploads had no tenant scoping at all),
    // which the media library specifically needed fixed — see
    // governance.ts's media wrapper and strapi-cms/src/api/media-meta.
    async upload(file: File): Promise<MediaAsset> {
      const fd = new FormData();
      fd.append("files", file);
      const r = await fetch(BASE + "/media", { method: "POST", body: fd });
      if (!r.ok) throw new CmsError("upload failed", r.status);
      const j = await json(r);
      if (!j?.id) throw new Error("upload response missing id");
      return j;
    },
    async list(opts): Promise<MediaAssetList> {
      const params = new URLSearchParams();
      if (opts?.search) params.set("search", opts.search);
      if (opts?.page) params.set("page", String(opts.page));
      if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
      const qs = params.toString();
      const r = await fetch(BASE + "/media" + (qs ? "?" + qs : ""));
      if (!r.ok) throw new CmsError("media list failed", r.status);
      return (await json(r)) || { data: [], total: 0, page: 1, pageSize: 30 };
    },
    async update(id, patch): Promise<MediaAsset> {
      const r = await fetch(BASE + "/media/" + encodeURIComponent(id), {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!r.ok) throw new CmsError("media update failed", r.status);
      return json(r);
    },
    async remove(id): Promise<void> {
      const r = await fetch(BASE + "/media/" + encodeURIComponent(id), { method: "DELETE" });
      if (!r.ok) throw new CmsError("media remove failed", r.status);
    },
  },

  auth: {
    async me(): Promise<CurrentUser | null> {
      const r = await fetch(BASE + "/auth/me");
      if (!r.ok) return null;
      return await json(r);
    },
    async listRoles(tenantKey?: string): Promise<{ id: any; name: string }[]> {
      const r = await fetch(BASE + "/auth/roles" + (tenantKey ? "?tenant=" + encodeURIComponent(tenantKey) : ""));
      if (!r.ok) return [];
      return (await json(r)) || [];
    },
    async listUsers(tenantKey: string): Promise<AdminUser[]> {
      const r = await fetch(BASE + "/auth/users?tenant=" + encodeURIComponent(tenantKey));
      if (!r.ok) throw await errorFrom(r);
      return (await json(r)) || [];
    },
    async create(tenantKey: string, input: NewUserInput): Promise<{ user: AdminUser; tempPassword: string }> {
      const r = await fetch(BASE + "/auth/users?tenant=" + encodeURIComponent(tenantKey), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (!r.ok) throw await errorFrom(r);
      return await json(r);
    },
    async remove(tenantKey: string, input: { id: any; email: string }): Promise<RemoveUserResult> {
      const qs = "?tenant=" + encodeURIComponent(tenantKey) + "&email=" + encodeURIComponent(input.email);
      const r = await fetch(BASE + "/auth/users/" + encodeURIComponent(String(input.id)) + qs, { method: "DELETE" });
      if (!r.ok) throw await errorFrom(r);
      return (await json(r)) || { removed: true, accountDeleted: false };
    },
  },
};
