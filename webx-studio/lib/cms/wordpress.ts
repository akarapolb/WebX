// WordPress implementation of CmsAdapter — server-only. Started deliberately
// narrow in Phase 2 (native `post` only) to prove the CmsAdapter contract
// against a structurally different engine; Phase 8 adds two real custom post
// types (service, publication — see POST_TYPES below) for tenants whose
// content genuinely needs them. Still no ACF/meta-field support — every
// registered type shares the same title/excerpt/content shape as a plain
// post, deliberately, so normalizePost needs no per-type variants.
//
// Two real shape differences worth calling out, both handled here so nothing
// upstream (governance.ts, the 21 UI components) needs to know about them:
//  - WP's title/content/excerpt come back as {rendered, raw} objects on read
//    but are plain strings on write. EntryEditor only edits string fields, so
//    reads are flattened to plain strings here; writes pass straight through
//    (WP itself accepts plain strings, so no re-wrapping needed).
//  - WP's post status is "publish"/"draft"/... ; the UI's hardcoded checks
//    expect Strapi's "published"/draft-with-no-status convention, so reads
//    normalize "publish" -> "published" + a synthesized publishedAt.
import "server-only";
import type {
  CmsAdapter, EntryQuery, EntryList, ContentTypeInfo, MediaAsset, CurrentUser, AdminUser,
} from "./types";
import { CmsError } from "./types";
import { sessionToken } from "../strapi";
import { WORDPRESS_URL } from "../config";

const BASE = WORDPRESS_URL;

// Phase 8 — was hardcoded to exactly one type (wp:post); services and
// publications for the new ORST/RoyalSociety tenants are real WordPress
// custom post types (same shape as native posts — title/excerpt/content —
// so normalizePost below needs no per-type variants), registered via the
// custom-post-types mu-plugin. Every method below resolves its uid through
// this registry instead of a single hardcoded REST path.
const POST_TYPES: Record<string, { restBase: string; name: string }> = {
  "wp:post": { restBase: "posts", name: "Post" },
  "wp:service": { restBase: "service", name: "Service" },
  "wp:publication": { restBase: "publication", name: "Publication" },
  // Phase 9 — faq/resource are new custom post types; page reuses WP's
  // native `page` type (rest base "pages") for hero/About narrative prose.
  "wp:faq": { restBase: "faq", name: "FAQ" },
  "wp:resource": { restBase: "resource", name: "Resource" },
  "wp:page": { restBase: "pages", name: "Page" },
  // Phase 10 — the About page's remaining structured sections, each its own
  // repeatable post type (see custom-post-types.php's comment for why —
  // ACF free has no Repeater field, so "one entry per item" reuses this
  // exact proven pattern instead).
  "wp:timeline": { restBase: "timeline-event", name: "Timeline Event" },
  "wp:mission": { restBase: "mission-item", name: "Mission Item" },
  "wp:org-unit": { restBase: "org-unit", name: "Org Unit" },
  "wp:document": { restBase: "document", name: "Document" },
};
function resolvePostType(uid: string): { restBase: string; name: string } {
  const t = POST_TYPES[uid];
  if (!t) throw new CmsError("WordPress adapter does not support " + uid, 400);
  return t;
}

// Phase 10 — which uids carry ACF field groups, and which top-level data
// keys belong to them. ACF's REST contract needs its own fields nested
// under {acf: {...}} in the request body (unlike title/excerpt/content/
// tenant, which are plain top-level WP fields) — create/update below split
// `data` accordingly. Keys here must match the `name` given to each field
// in the acf-fields.php mu-plugin.
const ACF_FIELDS: Record<string, string[]> = {
  "wp:timeline": ["year", "status_label", "order"],
  "wp:mission": ["icon", "order"],
  "wp:org-unit": ["order"],
  "wp:document": ["tag", "fiscal_year", "file_url", "order"],
  "wp:service": ["icon"],
  "wp:publication": ["icon"],
  "wp:resource": ["icon"],
  "wp:faq": ["icon"],
};
function splitAcfFields(uid: string, data: Record<string, any>): Record<string, any> {
  const acfKeys = ACF_FIELDS[uid];
  if (!acfKeys) return data;
  const acf: Record<string, any> = {};
  const rest: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (acfKeys.includes(k)) acf[k] = v;
    else rest[k] = v;
  }
  return Object.keys(acf).length ? { ...rest, acf } : rest;
}

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await sessionToken(); // the Basic-auth string itself, see lib/wordpress.ts
  if (!token) throw new CmsError("Unauthenticated", 401);
  return { Authorization: "Basic " + token, ...(extra || {}) };
}

function richText(field: any): string {
  if (field == null) return "";
  if (typeof field === "string") return field;
  return field.raw ?? field.rendered ?? "";
}

// Phase 5 multi-tenancy — WordPress has no native tenant concept, so a
// `wtenant` taxonomy (mu-plugin-registered on `post`, show_in_rest: true)
// stands in for Strapi's tenant relation. governance.ts stamps/filters by
// tenant KEY (a string like "dga"); this module owns translating that to/from
// the taxonomy's term ids, the only shape WP's REST API understands.
let wtenantCache: { at: number; byKey: Map<string, number>; byId: Map<number, string> } =
  { at: 0, byKey: new Map(), byId: new Map() };
async function wtenantTerms(): Promise<typeof wtenantCache> {
  const now = Date.now();
  if (now - wtenantCache.at > 30_000 || wtenantCache.byKey.size === 0) {
    try {
      const r = await fetch(BASE + "/wp/v2/wtenant?per_page=100", { headers: await authHeaders(), cache: "no-store" });
      const terms = r.ok ? await json(r) : [];
      const byKey = new Map<string, number>(), byId = new Map<number, string>();
      (terms || []).forEach((t: any) => { byKey.set(t.slug, t.id); byId.set(t.id, t.slug); });
      wtenantCache = { at: now, byKey, byId };
    } catch { /* keep the stale cache rather than erroring the caller */ }
  }
  return wtenantCache;
}

// Phase 10 — the other half of "create a new WordPress-backed tenant":
// NewWorkspace.tsx only ever created the Strapi Tenant record; nothing made
// the matching wtenant TERM this shared WordPress instance actually scopes
// content by, so every new WordPress tenant needed that created by hand
// before any of its content could be tagged correctly. Called from
// governance.ts's create() right after a new tenant with engine:"wordpress"
// is created, under the scheduler's service credentials (see
// withServiceToken there) since there's no ambient admin session for a
// brand-new workspace to author WordPress content with yet.
// Idempotent (checks for an existing term with this slug first) and safe to
// call speculatively — if it fails, tenant creation itself must not fail;
// the term can still be created by hand exactly as before this existed.
export async function ensureWtenantTerm(key: string): Promise<void> {
  const existing = await fetch(BASE + "/wp/v2/wtenant?slug=" + encodeURIComponent(key), { headers: await authHeaders(), cache: "no-store" });
  if (existing.ok) {
    const rows = await json(existing);
    if (Array.isArray(rows) && rows.length) return;
  }
  const r = await fetch(BASE + "/wp/v2/wtenant", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name: key, slug: key }),
    cache: "no-store",
  });
  if (!r.ok) throw new CmsError("failed to create wtenant term", r.status);
  wtenantCache = { at: 0, byKey: new Map(), byId: new Map() }; // invalidate so the new term is visible on the very next lookup
}

function normalizePost(p: any, terms?: typeof wtenantCache): any {
  const published = p.status === "publish";
  const wtenantId: number | undefined = Array.isArray(p.wtenant) ? p.wtenant[0] : undefined;
  return {
    // Phase 10 — spread ACF values in first so the fixed fields below always
    // win on key collision, and so EntryEditor's plain value-shape heuristic
    // (lib/cms/wordpress.ts callers never see "acf" as a nested object) can
    // pick up e.g. `year`/`order`/`icon` as ordinary top-level fields. Without
    // this, ACF writes would round-trip invisibly — see the Phase 10 plan.
    ...(p.acf || {}),
    id: p.id,
    documentId: String(p.id),
    title: richText(p.title),
    excerpt: richText(p.excerpt),
    content: richText(p.content),
    status: published ? "published" : "draft",
    publishedAt: published ? p.date : null,
    createdAt: p.date,
    updatedAt: p.modified,
    slug: p.slug,
    tenantKey: wtenantId != null ? terms?.byId.get(wtenantId) ?? null : null,
  };
}

// governance.ts's tenantStamp() sends {tenant: "<key>"} (a plain string, its
// engine-agnostic shape) on create/update for WP_SCOPED types. WP itself has
// no "tenant" field — translate to {wtenant:[<termId>]} and drop the
// original key so it doesn't get sent to WP as an unrecognized field.
function tenantKeyToWtenant(data: Record<string, any>, terms: { byKey: Map<string, number> }): Record<string, any> {
  if (!data || typeof data.tenant !== "string") return data;
  const { tenant, ...rest } = data;
  const id = terms.byKey.get(tenant);
  return id != null ? { ...rest, wtenant: [id] } : rest;
}

// Strapi-style "field:DIR" sort strings, best-effort translated to WP's
// orderby/order params. Falls back to WP's default (date desc) if unknown.
const SORT_FIELD_MAP: Record<string, string> = { updatedAt: "modified", createdAt: "date", title: "title" };
function applySort(params: URLSearchParams, sort?: string) {
  if (!sort) return;
  const [field, dir] = sort.split(":");
  const orderby = SORT_FIELD_MAP[field];
  if (!orderby) return;
  params.set("orderby", orderby);
  if (dir) params.set("order", dir.toLowerCase());
}

function statusParam(status?: "draft" | "published" | ""): string | undefined {
  if (status === "published") return "publish";
  if (status === "draft") return "draft";
  return "publish,draft,pending,future"; // "" / unset — everything, matches Strapi's "all" filter
}

async function json(r: Response): Promise<any> {
  try { return await r.json(); } catch { return null; }
}

export const wordpressAdapter: CmsAdapter = {
  schema: {
    async listContentTypes(): Promise<ContentTypeInfo[]> {
      // Minimal Strapi-shaped attributes so ContentBrowser's generic
      // "fill required fields on create" logic (which reads this map, not
      // anything WP-specific) can supply a title — WP's REST API rejects a
      // completely empty post create. One entry per registered type.
      return Object.entries(POST_TYPES).map(([uid, t]) => ({
        uid, name: t.name, api: t.restBase, attributes: { title: { type: "string", required: true } },
      }));
    },
  },

  entries: {
    async list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>> {
      const { restBase } = resolvePostType(uid);
      const terms = await wtenantTerms();
      const params = new URLSearchParams();
      params.set("page", String(query?.page ?? 1));
      params.set("per_page", String(query?.pageSize ?? 20));
      params.set("status", statusParam(query?.status) || "publish");
      if (query?.q?.trim()) params.set("search", query.q.trim());
      applySort(params, query?.sort);
      // governance.ts injects a {field:"tenant.key", op:"eq"} filter for
      // WP_SCOPED types (see WP_SCOPED there) — translate it to the wtenant
      // taxonomy's native ?wtenant=<termId> REST filter. Any other filter is
      // ignored, not errored (this adapter's scope is narrow by design).
      const tf = (query?.filter || []).find((f) => f.field === "tenant.key" && f.op === "eq");
      if (tf) {
        const id = terms.byKey.get(String(tf.value));
        params.set("wtenant", id != null ? String(id) : "-1"); // unknown tenant key -> no results, not "everything"
      }
      const r = await fetch(BASE + "/wp/v2/" + restBase + "?" + params.toString(), { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("list failed", r.status);
      const rows = await json(r);
      const total = Number(r.headers.get("X-WP-Total") ?? (rows?.length || 0));
      const pageCount = Number(r.headers.get("X-WP-TotalPages") ?? 1);
      return { data: (rows || []).map((p: any) => normalizePost(p, terms)) as T[], total, pageCount };
    },
    async get<T = any>(uid: string, id: string): Promise<T | null> {
      const { restBase } = resolvePostType(uid);
      const [r, terms] = await Promise.all([
        fetch(BASE + "/wp/v2/" + restBase + "/" + encodeURIComponent(id) + "?context=edit", { headers: await authHeaders(), cache: "no-store" }),
        wtenantTerms(),
      ]);
      if (!r.ok) throw new CmsError("get failed", r.status);
      return normalizePost(await json(r), terms) as T;
    },
    async create<T = any>(uid: string, data: Record<string, any>): Promise<T> {
      const { restBase } = resolvePostType(uid);
      const terms = await wtenantTerms();
      const body = splitAcfFields(uid, tenantKeyToWtenant(data, terms));
      const r = await fetch(BASE + "/wp/v2/" + restBase, {
        method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "draft", ...body }), cache: "no-store",
      });
      if (!r.ok) throw new CmsError("create failed", r.status);
      return normalizePost(await json(r), terms) as T;
    },
    async update<T = any>(uid: string, id: string, data: Record<string, any>): Promise<T> {
      const { restBase } = resolvePostType(uid);
      const terms = await wtenantTerms();
      const body = splitAcfFields(uid, tenantKeyToWtenant(data, terms));
      const r = await fetch(BASE + "/wp/v2/" + restBase + "/" + encodeURIComponent(id), {
        method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }), // WP REST uses POST for partial updates
        body: JSON.stringify(body), cache: "no-store",
      });
      if (!r.ok) throw new CmsError("update failed", r.status);
      return normalizePost(await json(r), terms) as T;
    },
    async remove(uid: string, id: string): Promise<void> {
      const { restBase } = resolvePostType(uid);
      const r = await fetch(BASE + "/wp/v2/" + restBase + "/" + encodeURIComponent(id) + "?force=true", { method: "DELETE", headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("delete failed", r.status);
    },
  },

  publish: {
    async publish(uid: string, id: string): Promise<void> {
      const { restBase } = resolvePostType(uid);
      const r = await fetch(BASE + "/wp/v2/" + restBase + "/" + encodeURIComponent(id), {
        method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "publish" }), cache: "no-store",
      });
      if (!r.ok) throw new CmsError("publish failed", r.status);
    },
    async unpublish(uid: string, id: string): Promise<void> {
      const { restBase } = resolvePostType(uid);
      const r = await fetch(BASE + "/wp/v2/" + restBase + "/" + encodeURIComponent(id), {
        method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "draft" }), cache: "no-store",
      });
      if (!r.ok) throw new CmsError("unpublish failed", r.status);
    },
  },

  media: {
    async upload(file: File): Promise<MediaAsset> {
      const buf = await file.arrayBuffer();
      const r = await fetch(BASE + "/wp/v2/media", {
        method: "POST",
        headers: await authHeaders({
          "Content-Type": file.type || "application/octet-stream",
          "Content-Disposition": 'attachment; filename="' + (file.name || "upload") + '"',
        }),
        body: buf, cache: "no-store",
      });
      if (!r.ok) throw new CmsError("upload failed", r.status);
      const m = await json(r);
      return { id: m.id, url: m.source_url, mime: m.mime_type, name: m.slug };
    },
  },

  auth: {
    async me(): Promise<CurrentUser | null> {
      const r = await fetch(BASE + "/wp/v2/users/me?context=edit", { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) return null;
      const u = await json(r);
      if (!u) return null;
      const roles: string[] = u.roles || [];
      return { id: u.id, email: u.email, roles, isSuperAdmin: roles.includes("administrator") };
    },
    async listRoles(): Promise<{ id: any; name: string }[]> {
      // WP core has no list-roles REST endpoint without a plugin — the
      // standard built-in role set is a reasonable stand-in for this proof.
      return ["administrator", "editor", "author", "contributor", "subscriber"].map((name) => ({ id: name, name }));
    },
    async listUsers(): Promise<AdminUser[]> {
      const r = await fetch(BASE + "/wp/v2/users?context=edit&per_page=100", { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("listUsers failed", r.status);
      const list = await json(r);
      return (list || []).map((u: any) => ({
        id: u.id, firstname: u.name, lastname: "", email: u.email, isActive: true, roles: u.roles || [],
      }));
    },
  },
};
