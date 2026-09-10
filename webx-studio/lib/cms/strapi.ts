// Strapi implementation of CmsAdapter — server-only, talks to Strapi's admin
// content-manager API DIRECTLY (not through the browser-facing /api/strapi
// pass-through) using the session's bearer token. As of Phase 1 this module
// is called only from lib/cms/governance.ts, never from a browser component;
// see docs/TECHNICAL.md and the Engine Adapter Blueprint for why.
import "server-only";
import type {
  CmsAdapter, EntryQuery, EntryList, ContentTypeInfo, MediaAsset, MediaAssetList, CurrentUser, AdminUser, NewUserInput,
} from "./types";
import { CmsError } from "./types";
import { actingSession, sessionToken } from "../strapi";
import { STRAPI_URL } from "../config";
import { genTempPassword } from "./genPassword";

const BASE = STRAPI_URL;

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await sessionToken();
  if (!token) throw new CmsError("Unauthenticated", 401);
  // Tags every request this adapter makes as WebX-governed, so Strapi's own
  // documents.use() hook skips its own audit-log write for it (governance.ts
  // writes that row instead) — see strapi-cms/src/index.ts.
  // A background job runs on the scheduler's token, which Strapi doesn't
  // scope; naming the owner lets strapi-cms's hook scope and field-police the
  // write as them (strapi-cms/src/index.ts's actingIdentity).
  const acting = actingSession();
  const actingHeaders: Record<string, string> = acting ? { "X-WebX-Acting-Email": acting.email, "X-WebX-Acting-Tenant": acting.tenantKey } : {};
  return { Authorization: "Bearer " + token, "X-WebX-Governed": "1", ...actingHeaders, ...(extra || {}) };
}

/** Strapi's own file shape (from /upload or /api/media-meta) -> MediaAsset.
 * `formats.thumbnail` only exists for images Strapi could resize — anything
 * else (PDFs, or an image below the thumbnail breakpoint) falls back to the
 * file's own url, matching MediaLibrary.tsx's own display logic. */
function toMediaAsset(f: any): MediaAsset {
  return {
    id: f.id, documentId: f.documentId, url: f.url, mime: f.mime, name: f.name,
    thumbnailUrl: f.formats?.thumbnail?.url || f.url,
    width: f.width, height: f.height,
    caption: f.caption || undefined, alt: f.alternativeText || undefined, tags: f.tags || undefined,
  };
}

/** Exported so tests/agent-tools.test.ts can verify the "gte" filter op
 * (added for governance.ts's enforceAgentRunLimit) interpolates into
 * Strapi's own `filters[field][$gte]=value` shape correctly — this function
 * itself needed no change for that op, only FilterOp's own type widening
 * (lib/cms/types.ts), which is the thing worth directly verifying. */
export function buildQuery(q?: EntryQuery): string {
  if (!q) return "";
  const parts: string[] = [];
  if (q.page != null) parts.push("page=" + q.page);
  if (q.pageSize != null) parts.push("pageSize=" + q.pageSize);
  if (q.sort) parts.push("sort=" + q.sort);
  if (q.status) parts.push("status=" + q.status);
  if (q.q && q.q.trim()) parts.push("_q=" + encodeURIComponent(q.q.trim()));
  for (const f of q.filter || []) {
    const path = f.field.split(".").map((seg) => "[" + seg + "]").join("");
    parts.push("filters" + path + "[$" + f.op + "]=" + encodeURIComponent(String(f.value)));
  }
  return parts.length ? "?" + parts.join("&") : "";
}

function entryUrl(uid: string, id?: string, opts?: { locale?: string }, suffix?: string): string {
  let url = BASE + "/content-manager/collection-types/" + uid;
  if (id) url += "/" + id;
  if (suffix) url += "/" + suffix;
  if (opts?.locale) url += "?locale=" + encodeURIComponent(opts.locale);
  return url;
}

async function json(r: Response): Promise<any> {
  try { return await r.json(); } catch { return null; }
}

/** Strapi's content-manager error body is usually genuinely informative
 * (e.g. "jobId must be defined" for a missing required field, or the exact
 * enum values a field accepts) — found live via the WebX Agent: every
 * "<action> failed" throw here used to discard that body entirely, so a
 * validation 400 gave the caller (a human's catch block, or the agent's own
 * executeTool -> CmsError.message -> model feedback loop) zero signal to
 * fix the actual problem. The agent kept moving on to a different content
 * type instead of retrying with corrected fields — same "silent generic
 * failure" shape as the content-type-uid bug fixed earlier in tools.ts,
 * just one layer deeper. `errors[].message`/`details.errors[]` covers
 * Strapi 5's own validation-error shape; `.message`/`.name` covers its
 * plainer error shapes (auth, not-found, etc.). */
async function errorMessage(r: Response, fallback: string): Promise<string> {
  const j = await json(r);
  const e = j?.error;
  if (!e) return fallback;
  const detail =
    (Array.isArray(e.details?.errors) && e.details.errors.map((d: any) => d.message).filter(Boolean).join("; ")) ||
    e.message || e.name;
  return detail ? `${fallback}: ${detail}` : fallback;
}

export const strapiAdapter: CmsAdapter = {
  schema: {
    async listContentTypes(): Promise<ContentTypeInfo[]> {
      const r = await fetch(BASE + "/content-manager/content-types", { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("listContentTypes failed", r.status);
      const j = await json(r);
      const raw: any[] = (j?.data ?? j?.results ?? []).filter(
        (x: any) => x.kind === "collectionType" && typeof x.uid === "string" && x.uid.startsWith("api::") && x.isDisplayed !== false
      );
      return raw
        .map((x: any) => ({
          uid: x.uid,
          name: x.info?.displayName ?? x.apiID ?? x.uid,
          api: x.apiID ?? "",
          pluralName: x.info?.pluralName ?? "",
          attributes: x.attributes || {},
        }))
        .sort((a: ContentTypeInfo, b: ContentTypeInfo) => a.name.localeCompare(b.name));
    },
  },

  entries: {
    async list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>> {
      const r = await fetch(entryUrl(uid) + buildQuery(query), { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError(await errorMessage(r, "list failed"), r.status);
      const j = await json(r);
      const rows: T[] = j?.results ?? j?.data ?? [];
      return {
        data: rows,
        total: j?.pagination?.total ?? rows.length,
        pageCount: j?.pagination?.pageCount ?? 1,
      };
    },
    async get<T = any>(uid: string, id: string, opts?: { locale?: string }): Promise<T | null> {
      const r = await fetch(entryUrl(uid, id, opts), { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError(await errorMessage(r, "get failed"), r.status);
      const j = await json(r);
      return (j?.data ?? j) as T;
    },
    async create<T = any>(uid: string, data: Record<string, any>): Promise<T> {
      const r = await fetch(entryUrl(uid), {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data),
        cache: "no-store",
      });
      if (!r.ok) throw new CmsError(await errorMessage(r, "create failed"), r.status);
      const j = await json(r);
      return (j?.data ?? j) as T;
    },
    async update<T = any>(uid: string, id: string, data: Record<string, any>, opts?: { locale?: string }): Promise<T> {
      const body = opts?.locale ? { ...data, locale: opts.locale } : data;
      const r = await fetch(entryUrl(uid, id, opts), {
        method: "PUT",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!r.ok) throw new CmsError(await errorMessage(r, "update failed"), r.status);
      const j = await json(r);
      return (j?.data ?? j) as T;
    },
    async remove(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
      const r = await fetch(entryUrl(uid, id, opts), { method: "DELETE", headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError(await errorMessage(r, "delete failed"), r.status);
    },
  },

  publish: {
    async publish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
      const r = await fetch(entryUrl(uid, id, opts, "actions/publish"), {
        method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }), body: "{}", cache: "no-store",
      });
      if (!r.ok) throw new CmsError("publish failed", r.status);
    },
    async unpublish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
      const r = await fetch(entryUrl(uid, id, opts, "actions/unpublish"), {
        method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }), body: "{}", cache: "no-store",
      });
      if (!r.ok) throw new CmsError("unpublish failed", r.status);
    },
  },

  media: {
    // Media library gap (TOR — search/tag/reuse/crop/caption): uploads now
    // ALSO get claimed for the caller's tenant immediately afterward, via
    // strapi-cms's own custom src/api/media-meta (plugin::upload.file has
    // no tenant scoping of its own — see that file's top comment for why).
    // A failed claim doesn't fail the upload itself (the file still exists
    // and is usable), it just won't show up in anyone's media library until
    // claimed later from there.
    async upload(file: File): Promise<MediaAsset> {
      const fd = new FormData();
      fd.append("files", file);
      const r = await fetch(BASE + "/upload", { method: "POST", headers: await authHeaders(), body: fd, cache: "no-store" });
      if (!r.ok) throw new CmsError("upload failed", r.status);
      const j = await json(r);
      const f = Array.isArray(j) ? j[0] : j;
      if (!f?.id) throw new Error("upload response missing id");
      if (f.documentId) {
        try {
          await fetch(BASE + "/api/media-meta/" + f.documentId, { method: "PUT", headers: await authHeaders({ "Content-Type": "application/json" }), body: "{}", cache: "no-store" });
        } catch { /* see comment above */ }
      }
      return toMediaAsset(f);
    },
    async list(opts): Promise<MediaAssetList> {
      const params = new URLSearchParams();
      if (opts?.search) params.set("search", opts.search);
      if (opts?.page) params.set("page", String(opts.page));
      if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
      const r = await fetch(BASE + "/api/media-meta?" + params.toString(), { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("media list failed", r.status);
      const j = await json(r);
      return { data: (j.data || []).map(toMediaAsset), total: j.meta?.pagination?.total ?? 0, page: j.meta?.pagination?.page ?? 1, pageSize: j.meta?.pagination?.pageSize ?? 30 };
    },
    async update(id, patch): Promise<MediaAsset> {
      const body: Record<string, any> = {};
      if (patch.caption !== undefined) body.caption = patch.caption;
      if (patch.alt !== undefined) body.alternativeText = patch.alt;
      if (patch.tags !== undefined) body.tags = patch.tags;
      const r = await fetch(BASE + "/api/media-meta/" + id, { method: "PUT", headers: await authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body), cache: "no-store" });
      if (!r.ok) throw new CmsError("media update failed", r.status);
      const j = await json(r);
      return toMediaAsset(j.data);
    },
    async remove(id): Promise<void> {
      const r = await fetch(BASE + "/api/media-meta/" + id, { method: "DELETE", headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("media remove failed", r.status);
    },
  },

  auth: {
    async me(): Promise<CurrentUser | null> {
      const r = await fetch(BASE + "/admin/users/me", { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) return null;
      const j = await json(r);
      const u = j?.data ?? j;
      if (!u) return null;
      const roleObjs: any[] = u.roles || [];
      const roles = roleObjs.map((x: any) => x.name).filter(Boolean);
      const isSuperAdmin = roleObjs.some((r: any) => r?.code === "strapi-super-admin" || r?.name === "Super Admin");
      return { id: u.id, email: u.email, roles, isSuperAdmin };
    },
    async listRoles(): Promise<{ id: any; name: string }[]> {
      const r = await fetch(BASE + "/admin/roles", { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) return [];
      const j = await json(r);
      const list = j?.data ?? j?.results ?? [];
      return list.map((x: any) => ({ id: x.id, name: x.name }));
    },
    async listUsers(): Promise<AdminUser[]> {
      const r = await fetch(BASE + "/admin/users?pageSize=100", { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("listUsers failed", r.status);
      const j = await json(r);
      const list = j?.data?.results ?? j?.results ?? [];
      return list.map((u: any) => ({
        id: u.id, firstname: u.firstname, lastname: u.lastname, email: u.email,
        isActive: u.isActive, roles: (u.roles || []).map((x: any) => x.name).filter(Boolean),
      }));
    },
    async findUserByEmail(email: string): Promise<AdminUser | null> {
      const r = await fetch(BASE + "/admin/users?pageSize=20&_q=" + encodeURIComponent(email), { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("findUserByEmail failed", r.status);
      const j = await json(r);
      const list: any[] = j?.data?.results ?? j?.results ?? [];
      const u = list.find((x: any) => String(x.email || "").toLowerCase() === email.toLowerCase());
      if (!u) return null;
      return {
        id: u.id, firstname: u.firstname, lastname: u.lastname, email: u.email,
        isActive: u.isActive, roles: (u.roles || []).map((x: any) => x.name).filter(Boolean),
      };
    },
    // Strapi has no single-call "create with password" — POST /admin/users
    // creates an INACTIVE user with no password accepted at all (its own
    // validation schema rejects one), meant to be completed via an emailed
    // registration-token link. Since this whole app never configures SMTP,
    // the account is instead activated in a second call, same admin
    // session, right after — PUT /admin/users/:id accepts password+isActive
    // directly (no currentPassword required; that's only enforced on the
    // self-service profile-update schema). Verified against the live
    // instance during Phase 10's user-management research, not assumed.
    async create(input: NewUserInput): Promise<{ user: AdminUser; tempPassword: string }> {
      const createRes = await fetch(BASE + "/admin/users", {
        method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: input.email, firstname: input.firstname, lastname: input.lastname, roles: [input.roleId] }),
        cache: "no-store",
      });
      if (!createRes.ok) throw new CmsError("create user failed", createRes.status);
      const created = (await json(createRes))?.data;
      const tempPassword = input.password || genTempPassword();
      const activateRes = await fetch(BASE + "/admin/users/" + created.id, {
        method: "PUT", headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ password: tempPassword, isActive: true }),
        cache: "no-store",
      });
      if (!activateRes.ok) throw new CmsError("activate user failed", activateRes.status);
      const activated = (await json(activateRes))?.data ?? created;
      const user: AdminUser = {
        id: activated.id, firstname: activated.firstname, lastname: activated.lastname, email: activated.email,
        isActive: activated.isActive ?? true, roles: (activated.roles || []).map((x: any) => x.name).filter(Boolean),
      };
      return { user, tempPassword };
    },
    async remove(id: string | number): Promise<void> {
      const r = await fetch(BASE + "/admin/users/" + id, { method: "DELETE", headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("remove user failed", r.status);
    },
  },
};
