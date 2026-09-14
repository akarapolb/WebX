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
import crypto from "crypto";
import type {
  CmsAdapter, EntryQuery, EntryList, ContentTypeInfo, MediaAsset, MediaAssetList, CurrentUser, AdminUser, NewUserInput,
} from "./types";
import { CmsError } from "./types";
import { sessionToken } from "../strapi";
import { WORDPRESS_URL, WEBX_WP_PII_KEY } from "../config";
import { genTempPassword } from "./genPassword";

const BASE = WORDPRESS_URL;

// Phase 7 — decrypt-on-read counterpart to wordpress/mu-plugins/
// pii-crypto.php's webx_pii_encrypt() (same algorithm, same iv.ciphertext.
// authTag wire format). WordPress encrypts on write (in the public
// webx/v1/* submit routes — see that file); this is the only place that
// needs to decrypt, mirroring Strapi's own transparent afterFindOne/
// afterFindMany decryption so FormsInbox/EntryEditor never see ciphertext.
const PII_ALGO = "aes-256-gcm";
function looksEncrypted(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const parts = v.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[A-Za-z0-9+/]+=*$/.test(p));
}
function decryptPii(value: string): string {
  if (!looksEncrypted(value)) return value; // legacy/plaintext row, or genuinely empty — never throw on those
  if (!WEBX_WP_PII_KEY) throw new Error("WEBX_WP_PII_KEY not configured");
  const key = Buffer.from(WEBX_WP_PII_KEY, "base64");
  if (key.length !== 32) throw new Error("WEBX_WP_PII_KEY must decode (base64) to exactly 32 bytes");
  const [ivB64, ctB64, tagB64] = value.split(".");
  const decipher = crypto.createDecipheriv(PII_ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
// Which uid+field pairs carry PII that needs decrypting on the way out —
// matches exactly the fields public-forms-api.php encrypts on submit.
const PII_FIELDS: Record<string, string[]> = {
  "wp:complaint": ["name", "email", "phone"],
  "wp:application": ["name", "email", "phone"],
};
function decryptPiiFields(uid: string, entry: any): any {
  const fields = PII_FIELDS[uid];
  if (!fields || !entry) return entry;
  for (const f of fields) {
    if (typeof entry[f] === "string" && entry[f]) entry[f] = decryptPii(entry[f]);
  }
  return entry;
}

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
  // Phase 3 gap — event/member exist as real WP post types (see
  // custom-post-types.php) but were never registered here, so webx-studio's
  // generic content browser couldn't manage them. Closed in passing while
  // adding Phase 7's own new types below (same one-line-per-type cost).
  "wp:event": { restBase: "event", name: "Event" },
  "wp:member": { restBase: "member", name: "Member" },
  // Phase 7 — native WordPress polls/complaints/applications/breaking-news,
  // replacing the Strapi-backed shared-service layer these previously ran
  // on for orst/royalsociety (see wordpress/mu-plugins/public-forms-*.php).
  "wp:poll": { restBase: "poll", name: "Poll" },
  "wp:complaint": { restBase: "complaint", name: "Complaint" },
  "wp:contact-message": { restBase: "contact-message", name: "Contact Message" },
  "wp:job": { restBase: "job", name: "Job" },
  "wp:application": { restBase: "application", name: "Application" },
  "wp:breaking-news": { restBase: "breaking-news", name: "Breaking News Alert" },
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
  "wp:page": ["blocks"],
  // Phase 7 — field names match each CPT's ACF group 1:1 (see
  // wordpress/mu-plugins/public-forms-acf.php).
  "wp:poll": ["question", "options", "active", "total_votes"],
  "wp:complaint": ["ref", "type", "subject", "agency", "detail", "anonymous", "name", "email", "phone", "stage", "date", "steps", "attachment"],
  "wp:contact-message": ["email", "phone", "subject", "message", "handled"],
  "wp:job": ["jobId", "deptKey", "typeKey", "openings", "dept", "type", "location", "salary", "deadline", "summary", "responsibilities", "qualifications", "benefits"],
  "wp:application": ["ref", "jobId", "position", "name", "email", "phone", "note", "stage", "date", "resume", "extra"],
  "wp:breaking-news": ["active", "severity", "message", "url", "link_label"],
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

// ACF free has no Repeater/Flexible Content field, so the Visual Builder's
// WordPress-backed page layout (wp:page's "blocks" ACF field, see
// acf-fields.php's group_page_layout) rides on the wire as a JSON-encoded
// string in a plain textarea, but is an ARRAY everywhere else in this app —
// VisualBuilder.open() reads data.blocks expecting the same array shape a
// Strapi dynamic zone returns. Encode/decode right at this boundary so
// nothing above this module (or public-site's parseBlocks, its own mirror
// of this same string<->array boundary) ever sees the wire format.
const ACF_JSON_FIELDS: Record<string, string[]> = {
  "wp:page": ["blocks"],
  "wp:poll": ["options"],
  "wp:complaint": ["steps"],
  "wp:job": ["responsibilities", "qualifications", "benefits"],
  "wp:application": ["extra"],
};

/** The ACF field names a WordPress post type carries, and which of them hold
 * JSON — for the agent's get_content_type_schema. Null for an unknown uid. */
export function wordpressFieldNames(uid: string): { acf: string[]; json: string[] } | null {
  if (!POST_TYPES[uid]) return null;
  return { acf: ACF_FIELDS[uid] || [], json: ACF_JSON_FIELDS[uid] || [] };
}

function encodeJsonFields(uid: string, data: Record<string, any>): Record<string, any> {
  const keys = ACF_JSON_FIELDS[uid];
  if (!keys) return data;
  const out = { ...data };
  for (const k of keys) {
    // A key absent from `data` means this write doesn't touch it (e.g.
    // EntryEditor saving just a title) — leave it alone. Encoding it anyway
    // would inject `blocks: "[]"` into every unrelated save and silently
    // wipe the page's layout the next time someone e.g. renames the title.
    if (!(k in out)) continue;
    out[k] = out[k] == null ? "" : JSON.stringify(out[k]);
  }
  return out;
}
function decodeJsonFields(uid: string, entry: any): any {
  const keys = ACF_JSON_FIELDS[uid];
  if (!keys || !entry) return entry;
  for (const k of keys) {
    const v = entry[k];
    if (typeof v !== "string") continue; // already decoded, or genuinely absent
    try { entry[k] = v.trim() ? JSON.parse(v) : []; } catch { entry[k] = []; }
  }
  return entry;
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

/** WordPress's /wp/v2/media shape -> MediaAsset. `media_details.sizes` only
 * exists for images WP could generate thumbnails for (never for PDFs, etc)
 * — falls back to the file's own url, same as the Strapi adapter's
 * toMediaAsset. Caption/alt/tags all come back through richText/acf exactly
 * like every other WP field this file already normalizes. */
function toMediaAsset(m: any): MediaAsset {
  return {
    id: m.id, url: m.source_url, mime: m.mime_type, name: m.slug,
    thumbnailUrl: m.media_details?.sizes?.thumbnail?.source_url || m.source_url,
    width: m.media_details?.width, height: m.media_details?.height,
    caption: richText(m.caption) || undefined, alt: m.alt_text || undefined, tags: m.acf?.tags || undefined,
  };
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

function normalizePost(p: any, terms?: typeof wtenantCache, uid?: string): any {
  const published = p.status === "publish";
  const wtenantId: number | undefined = Array.isArray(p.wtenant) ? p.wtenant[0] : undefined;
  return decryptPiiFields(uid || "", decodeJsonFields(uid || "", {
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
  }));
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
        uid, name: t.name, api: t.restBase, pluralName: t.restBase, attributes: { title: { type: "string", required: true } },
        localized: false, // no per-locale copy mechanism modeled for WordPress here
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
      return { data: (rows || []).map((p: any) => normalizePost(p, terms, uid)) as T[], total, pageCount };
    },
    async get<T = any>(uid: string, id: string): Promise<T | null> {
      const { restBase } = resolvePostType(uid);
      const [r, terms] = await Promise.all([
        fetch(BASE + "/wp/v2/" + restBase + "/" + encodeURIComponent(id) + "?context=edit", { headers: await authHeaders(), cache: "no-store" }),
        wtenantTerms(),
      ]);
      if (!r.ok) throw new CmsError("get failed", r.status);
      return normalizePost(await json(r), terms, uid) as T;
    },
    async create<T = any>(uid: string, data: Record<string, any>): Promise<T> {
      const { restBase } = resolvePostType(uid);
      const terms = await wtenantTerms();
      const body = splitAcfFields(uid, encodeJsonFields(uid, tenantKeyToWtenant(data, terms)));
      const r = await fetch(BASE + "/wp/v2/" + restBase, {
        method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "draft", ...body }), cache: "no-store",
      });
      if (!r.ok) throw new CmsError("create failed", r.status);
      return normalizePost(await json(r), terms, uid) as T;
    },
    async update<T = any>(uid: string, id: string, data: Record<string, any>): Promise<T> {
      const { restBase } = resolvePostType(uid);
      const terms = await wtenantTerms();
      const body = splitAcfFields(uid, encodeJsonFields(uid, tenantKeyToWtenant(data, terms)));
      const r = await fetch(BASE + "/wp/v2/" + restBase + "/" + encodeURIComponent(id), {
        method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }), // WP REST uses POST for partial updates
        body: JSON.stringify(body), cache: "no-store",
      });
      if (!r.ok) throw new CmsError("update failed", r.status);
      return normalizePost(await json(r), terms, uid) as T;
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
    // Media library gap (TOR — search/tag/reuse/crop/caption) — media had
    // no tenant scoping at all before this (governance.ts's media.upload
    // wrapper called straight through, no tenant involved); now stamped
    // with the SAME wtenant taxonomy every other WP-hosted type here uses.
    // `tenantKey` is required here (unlike the Strapi adapter, WordPress
    // has no admin-session-to-tenant resolution of its own) — governance.ts
    // resolves it once via resolveEffectiveTenant and passes it through.
    async upload(file: File, tenantKey?: string): Promise<MediaAsset> {
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
      if (tenantKey) {
        const terms = await wtenantTerms();
        const id = terms.byKey.get(tenantKey);
        if (id != null) {
          try {
            await fetch(BASE + "/wp/v2/media/" + m.id, {
              method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ wtenant: [id] }), cache: "no-store",
            });
          } catch { /* upload itself already succeeded; a failed tag just means it won't show in the library until claimed there */ }
        }
      }
      return toMediaAsset(m);
    },
    async list(opts): Promise<MediaAssetList> {
      const terms = await wtenantTerms();
      const id = opts?.tenantKey ? terms.byKey.get(opts.tenantKey) : undefined;
      const params = new URLSearchParams({ wtenant: String(id ?? -1), per_page: String(opts?.pageSize || 30), page: String(opts?.page || 1), context: "edit" });
      if (opts?.search) params.set("search", opts.search);
      const r = await fetch(BASE + "/wp/v2/media?" + params.toString(), { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("media list failed", r.status);
      const rows = (await json(r)) || [];
      const total = Number(r.headers.get("X-WP-Total") || rows.length);
      return { data: rows.map(toMediaAsset), total, page: opts?.page || 1, pageSize: opts?.pageSize || 30 };
    },
    async update(id, patch): Promise<MediaAsset> {
      const body: Record<string, any> = {};
      if (patch.caption !== undefined) body.caption = patch.caption ?? "";
      if (patch.alt !== undefined) body.alt_text = patch.alt ?? "";
      if (patch.tags !== undefined) body.acf = { tags: patch.tags ?? "" };
      const r = await fetch(BASE + "/wp/v2/media/" + id + "?context=edit", {
        method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body), cache: "no-store",
      });
      if (!r.ok) throw new CmsError("media update failed", r.status);
      return toMediaAsset(await json(r));
    },
    async remove(id): Promise<void> {
      const r = await fetch(BASE + "/wp/v2/media/" + id + "?force=true", { method: "DELETE", headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("media remove failed", r.status);
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
    async findUserByEmail(email: string): Promise<AdminUser | null> {
      const r = await fetch(BASE + "/wp/v2/users?context=edit&per_page=20&search=" + encodeURIComponent(email), { headers: await authHeaders(), cache: "no-store" });
      if (!r.ok) throw new CmsError("findUserByEmail failed", r.status);
      const list = (await json(r)) || [];
      const u = list.find((x: any) => String(x.email || "").toLowerCase() === email.toLowerCase());
      // WordPress has no deactivated state; an account that exists can sign in.
      return u ? { id: u.id, firstname: u.name, lastname: "", email: u.email, isActive: true, roles: u.roles || [] } : null;
    },
    // WordPress, unlike Strapi, supports a real single-call "create with
    // password" — POST /wp/v2/users with a password in the body creates a
    // login-ready account immediately (wp_insert_user() under the hood;
    // core sends no email/notification for a REST-created user, confirmed
    // against the live instance during Phase 10's research). Needs
    // create_users capability (administrator) on the calling credential.
    async create(input: NewUserInput): Promise<{ user: AdminUser; tempPassword: string }> {
      const tempPassword = genTempPassword();
      const baseUsername = input.email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "") || "user";
      const name = [input.firstname, input.lastname].filter(Boolean).join(" ") || baseUsername;
      let username = baseUsername;
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetch(BASE + "/wp/v2/users", {
          method: "POST", headers: await authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ username, email: input.email, password: tempPassword, roles: [input.roleId], name }),
          cache: "no-store",
        });
        if (r.ok) {
          const u = await json(r);
          return { user: { id: u.id, firstname: u.name, lastname: "", email: u.email, isActive: true, roles: u.roles || [input.roleId] }, tempPassword };
        }
        const body = await json(r);
        const takenUsername = r.status === 400 && (body?.code === "existing_user_login" || String(body?.message || "").includes("username"));
        if (!takenUsername || attempt === 2) throw new CmsError(body?.message || "create user failed", r.status);
        username = baseUsername + (attempt + 2); // baseUsername2, baseUsername3
      }
      throw new CmsError("create user failed", 500); // unreachable — satisfies the return-type checker
    },
    // WordPress core doesn't support trashing a user, only a hard delete —
    // and its REST endpoint outright rejects the request without a
    // `reassign` target (confirmed live: 400 rest_missing_callback_param),
    // even for a brand-new account with nothing to reassign. Reassigns to
    // whichever credential is making this call (the scheduler service
    // account under withEngineAdapter — see governance.ts), since that's
    // always a valid, always-present WordPress user unlike trying to guess
    // the acting admin's own WP id.
    async remove(id: string | number): Promise<void> {
      const meR = await fetch(BASE + "/wp/v2/users/me", { headers: await authHeaders(), cache: "no-store" });
      const me = await json(meR);
      const reassign = me?.id ? "&reassign=" + me.id : "";
      const r = await fetch(BASE + "/wp/v2/users/" + id + "?force=true" + reassign, {
        method: "DELETE", headers: await authHeaders(), cache: "no-store",
      });
      if (!r.ok) throw new CmsError("remove user failed", r.status);
    },
  },
};
