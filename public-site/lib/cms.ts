// Build-time CMS data-fetcher — same Strapi endpoints/query shapes and same
// media-URL/date-formatting conventions as site/DGA-Website/assets/cms.js's
// boot(), just called at build time (generateStaticParams / the page's async
// component) instead of from the browser after load. Thai locale only for
// this proof — see the Phase 4 plan for what's deliberately out of scope.
const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const WORDPRESS = (process.env.WORDPRESS_URL || "http://localhost:8081/wp-json").replace(/\/$/, "");

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function fmtDateTh(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const yy = (d.getFullYear() + 543) % 100;
  return d.getDate() + " " + TH_MONTHS[d.getMonth()] + " " + yy;
}

export function fmtViewsTh(n?: number): string {
  return Number(n || 0).toLocaleString("th-TH");
}

export function mediaUrl(m: any): string {
  if (!m) return "";
  const u = m.url || m?.data?.attributes?.url || "";
  if (!u) return "";
  return u.indexOf("http") === 0 ? u : STRAPI + u;
}

async function get<T = any>(path: string, tenant: string): Promise<T | null> {
  const sep = path.includes("?") ? "&" : "?";
  const url = STRAPI + "/api/" + path + sep + "tenant=" + encodeURIComponent(tenant) + "&locale=th";
  try {
    // No cache: "no-store" here — static export needs the DEFAULT
    // Server-Component fetch behavior (fetch once at build time, bake the
    // result into the static HTML); "no-store" marks the route as needing
    // per-request dynamic rendering, which `output: "export"` can't do.
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) { console.error("[cms] " + url + " -> HTTP " + r.status); return null; }
    const j = await r.json();
    return j.data as T;
  } catch (e) {
    console.error("[cms] " + url + " -> " + (e as Error).message);
    return null;
  }
}

export type PublicTemplate = "gov-portal" | "orst" | "royalsociety";

export type Tenant = {
  key: string;
  name: string;
  brand?: { orgName?: { th?: string; en?: string }; primaryColor?: string; logoUrl?: string };
  contact?: { phone?: string; email?: string; address?: { th?: string; en?: string } };
  footerColumns?: { heading: { th?: string; en?: string }; links: { label: { th?: string; en?: string }; url?: string }[] }[];
  social?: { label?: string; url?: string }[];
  /** Which CmsAdapter this tenant's own content lives in (Phase 6, default "strapi"). */
  engine?: "strapi" | "wordpress";
  /** Which public-site component tree + page set to render (Phase 8, default "gov-portal"). */
  publicTemplate?: PublicTemplate;
};

export type TenantKeyInfo = { key: string; engine?: "strapi" | "wordpress"; publicTemplate?: PublicTemplate };
// A genuinely empty response (a fresh install with zero tenants seeded yet)
// is the only case this falls back for — a real bootstrap default, not the
// bug this fallback used to also cover. See listTenants()'s own comment for
// why a fetch FAILURE (Strapi unreachable/erroring) is handled completely
// differently, by throwing instead of using this.
const FALLBACK_TENANTS: TenantKeyInfo[] = [
  { key: "dga", publicTemplate: "gov-portal" },
  { key: "pea", publicTemplate: "gov-portal" },
];

/** Every known active tenant, with enough to route + template-select at
 * build time. Backed by Strapi's public GET /api/tenants/keys (Phase 6/8).
 *
 * Used to silently fall back to the two original demo tenants whenever
 * Strapi was unreachable at build time — the stated intent was "so a Strapi
 * outage doesn't drop pages that already existed," but in practice it did
 * exactly that for every OTHER tenant: a scheduled rebuild during a
 * transient Strapi hiccup would silently export only dga/pea, dropping
 * every other real tenant's pages from the site with the build still
 * reporting success. Found in a full-codebase audit (2026-09-12).
 *
 * Now throws on an actual fetch failure (network error or non-2xx) instead
 * — the CI/deploy pipeline calling `next build` sees a real non-zero exit
 * and a clear error instead of a silently incomplete export. Only a
 * genuinely empty (well-formed 200, zero tenants) response still falls back
 * to the demo tenants, since that's a legitimate fresh-install state, not
 * an outage. */
export async function listTenants(): Promise<TenantKeyInfo[]> {
  let r: Response;
  try {
    r = await fetch(STRAPI + "/api/tenants/keys", { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new Error("[cms] listTenants: Strapi unreachable at " + STRAPI + " — " + (e as Error).message);
  }
  if (!r.ok) throw new Error("[cms] listTenants: Strapi returned HTTP " + r.status + " for /api/tenants/keys");
  const j = await r.json();
  const list = ((j?.data as any[]) || []).filter((t) => t?.key) as TenantKeyInfo[];
  return list.length ? list : FALLBACK_TENANTS;
}

/** Resolves one tenant's public branding/contact/social/footer config.
 *
 * Used to return null on ANY failure — including Strapi being unreachable
 * — which HomePage.tsx then silently backfilled with a hardcoded
 * DGA-branded fallback (FALLBACK_TENANT). That meant a transient Strapi
 * outage during a scheduled rebuild could render a real agency's entire
 * site under DGA's name/logo/colors, with the build still exiting 0. Found
 * in a full-codebase audit (2026-09-12).
 *
 * Strapi's own /api/tenants/resolve controller (strapi-cms's tenant
 * controller) already falls back to the "dga" tenant itself when a
 * requested key doesn't match any tenant, and only 404s if there are
 * literally zero active tenants configured system-wide — so in practice a
 * null here has only ever meant "the request to Strapi itself failed"
 * (network error, non-2xx, malformed JSON), never a legitimate "this key
 * doesn't exist" signal from a healthy Strapi. Throwing here instead is
 * safe for exactly that reason: it can't accidentally turn a real
 * unknown-tenant case into a broken build, because that case was never
 * routed through here to begin with. */
export async function getTenant(key: string): Promise<Tenant> {
  const url = STRAPI + "/api/tenants/resolve?tenant=" + encodeURIComponent(key) + "&locale=th";
  let r: Response;
  try {
    r = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new Error("[cms] getTenant(" + key + "): Strapi unreachable at " + STRAPI + " — " + (e as Error).message);
  }
  if (!r.ok) throw new Error("[cms] getTenant(" + key + "): Strapi returned HTTP " + r.status);
  const j = await r.json();
  return j.data as Tenant;
}

/** Job/application e-forms (TOR gap audit — orst/royalsociety had no job
 * listings or application form anywhere). Originally a Strapi content type,
 * shared cross-engine; Phase 7 moved job postings natively into WordPress
 * for orst/royalsociety (wordpress/mu-plugins/public-forms-post-types.php's
 * `job` CPT) — read via the same getWpEntries() helper every other WP
 * content type here already uses, not a bespoke fetch. */
export type JobPosting = {
  documentId: string; jobId: string; title: string; dept?: string; type?: string;
  location?: string; salary?: string; deadline?: string; summary?: string;
  responsibilities?: string[]; qualifications?: string[]; benefits?: string[];
};
function parseJsonArray(raw: any): string[] | undefined {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : undefined; } catch { return undefined; }
}
export async function getJobs(tenant: string): Promise<JobPosting[]> {
  const rows = await getWpEntries(tenant, "job");
  return rows
    .map((r) => ({
      documentId: String(r.id), jobId: r.acf?.jobId || String(r.id), title: r.title || "",
      dept: r.acf?.dept, type: r.acf?.type, location: r.acf?.location, salary: r.acf?.salary,
      deadline: r.acf?.deadline, summary: r.acf?.summary,
      responsibilities: parseJsonArray(r.acf?.responsibilities),
      qualifications: parseJsonArray(r.acf?.qualifications),
      benefits: parseJsonArray(r.acf?.benefits),
    }))
    .sort((a, b) => String(a.deadline || "").localeCompare(String(b.deadline || "")));
}

function stripHtml(s?: string): string {
  return (s || "").replace(/<[^>]+>/g, "").trim();
}

/** A WordPress entry (native post or a Phase 8 custom post type — service,
 * publication) normalized to a plain, engine-agnostic shape. Public REST
 * reads here need no auth: published content is world-readable. */
export type WpEntry = {
  id: number;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  slug: string;
  imageUrl: string | null;
  /** Phase 10 — ACF field values (icon/order/year/tag/etc), passed through
   * verbatim as WP's REST API returns them under `acf`. Optional since most
   * post types (post/service/publication before Phase 10) have none. */
  acf?: Record<string, any>;
  /** The Visual Builder's page layout for a `wp:page` entry — parsed from
   * `acf.blocks` (see parseBlocks below). Only ever set on the result of
   * getWpPage; other WP entry types don't carry a layout. */
  blocks?: any[];
  /** Bilingual EN (TOR gap) — the same page's English layout, parsed from
   * `acf.blocks_en`. Only ever set on the result of getWpPage. Empty when
   * this page hasn't been made bilingual yet — see the /en/ routes' own
   * fallback-to-static-JSON handling. */
  blocksEn?: any[];
};

export type Locale = "th" | "en";

/** Bilingual EN (TOR gap) — WordPress (orst/royalsociety) has no native
 * per-locale entry model the way Strapi's i18n plugin does, so translatable
 * CPTs carry sibling `title_en`/`excerpt_en` ACF fields instead (see
 * wordpress/mu-plugins/acf-fields.php's group_i18n_en) on just the 5 CPTs
 * actually rendered on the pages made bilingual (service/org-unit/
 * mission-item/faq/member) — every other WP entry stays Thai-only
 * regardless of locale. Falls back to the Thai title/excerpt whenever the
 * `_en` field is blank, never silently renders empty.
 */
function localizeEntry(e: WpEntry, locale: Locale): WpEntry {
  if (locale !== "en") return e;
  const titleEn = (e.acf?.title_en || "").trim();
  const excerptEn = (e.acf?.excerpt_en || "").trim();
  return { ...e, title: titleEn || e.title, excerpt: excerptEn || e.excerpt };
}

/** ACF free has no Repeater/Flexible Content field, so the Visual Builder
 * stores a WordPress page's block layout as a JSON-encoded string in a plain
 * textarea (see wordpress/mu-plugins/acf-fields.php's group_page_layout).
 * Returns undefined (not []) on a missing/malformed value so callers can
 * fall back to their own default rather than rendering a page that's blank
 * because of a data problem, not because it's genuinely empty. */
function parseBlocks(acf: any, field: string = "blocks"): any[] | undefined {
  const raw = acf?.[field];
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

let wtenantIdCache: { at: number; map: Map<string, number> } = { at: 0, map: new Map() };
async function wtenantId(tenant: string): Promise<number | null> {
  const now = Date.now();
  if (now - wtenantIdCache.at > 60_000 || wtenantIdCache.map.size === 0) {
    try {
      const r = await fetch(WORDPRESS + "/wp/v2/wtenant?per_page=100", { headers: { Accept: "application/json" } });
      const terms = r.ok ? await r.json() : [];
      const map = new Map<string, number>();
      (terms || []).forEach((t: any) => map.set(t.slug, t.id));
      wtenantIdCache = { at: now, map };
    } catch { /* keep the stale cache rather than erroring every caller */ }
  }
  return wtenantIdCache.map.get(tenant) ?? null;
}

/** Fetch every published entry of one WordPress post type (REST base, e.g.
 * "posts"/"service"/"publication") tagged for `tenant`. Shared by
 * getWpArticles/getWpServices/getWpPublications below — same normalization,
 * different post type. Featured image needs a second request (WP's default
 * response only includes the media ID, not its URL) — fetched in parallel,
 * best-effort (a missing/broken image just means no imageUrl, not a failure). */
async function getWpEntries(tenant: string, restBase: string, locale: Locale = "th"): Promise<WpEntry[]> {
  try {
    const termId = await wtenantId(tenant);
    if (termId == null) return [];
    const r = await fetch(WORDPRESS + "/wp/v2/" + restBase + "?wtenant=" + termId + "&per_page=50&status=publish&_embed=wp:featuredmedia", { headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const rows = (await r.json()) as any[];
    return (rows || []).map((p) => localizeEntry({
      id: p.id,
      title: stripHtml(p.title?.rendered),
      excerpt: stripHtml(p.excerpt?.rendered),
      content: p.content?.rendered || "",
      date: p.date,
      slug: p.slug || "",
      imageUrl: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null,
      acf: p.acf || undefined,
    }, locale));
  } catch {
    return [];
  }
}

/** Ascending by `acf.order` (falls back to 0) — WP REST doesn't reliably
 * support orderby on custom meta without extra per-field registration, and
 * these lists are always small, so a client-side sort is simpler and just
 * as reliable. Shared by the 4 Phase 10 structured-section fetchers below. */
function sortByAcfOrder(entries: WpEntry[]): WpEntry[] {
  return [...entries].sort((a, b) => (Number(a.acf?.order) || 0) - (Number(b.acf?.order) || 0));
}

/** WordPress has no equivalent of services/banners/awards/faqs/videos in the
 * gov-portal template (see lib/cms/wordpress.ts's original "posts only"
 * scope) — a gov-portal WordPress tenant's homepage shows only articles,
 * every other section empty. ORST/RoyalSociety (Phase 8) use getWpServices/
 * getWpPublications directly instead, in their own templates. */
async function getWpArticles(tenant: string): Promise<any[]> {
  const entries = await getWpEntries(tenant, "posts");
  return entries.map((e) => ({
    documentId: "wp-" + e.id,
    title: e.title,
    excerpt: e.excerpt,
    body: e.content,
    kind: "news",
    categoryLabel: null,
    publishDate: e.date,
    views: 0,
    featured: false,
    tags: null,
    coverImage: null,
  }));
}

/** Raw wp:post entries in the plain WpEntry shape — used by ORST/RoyalSociety
 * templates directly (unlike the gov-portal-shaped getWpArticles above). */
export async function getWpNews(tenant: string): Promise<WpEntry[]> {
  return getWpEntries(tenant, "posts");
}

export async function getWpServices(tenant: string, locale: Locale = "th"): Promise<WpEntry[]> {
  return getWpEntries(tenant, "service", locale);
}

export async function getWpPublications(tenant: string): Promise<WpEntry[]> {
  return getWpEntries(tenant, "publication");
}

export async function getWpFaqs(tenant: string, locale: Locale = "th"): Promise<WpEntry[]> {
  return getWpEntries(tenant, "faq", locale);
}

export async function getWpResources(tenant: string): Promise<WpEntry[]> {
  return getWpEntries(tenant, "resource");
}

/** Phase 10 — the About page's remaining structured sections, each its own
 * repeatable post type (see the Phase 10 plan's ACF-free-vs-pro rationale).
 * `acf.year`/`acf.status_label`, `acf.icon`, none, and `acf.tag`/
 * `acf.fiscal_year`/`acf.file_url` respectively are the extra fields each
 * carries beyond the common title/excerpt/content shape. */
export async function getWpTimeline(tenant: string): Promise<WpEntry[]> {
  return sortByAcfOrder(await getWpEntries(tenant, "timeline-event"));
}

export async function getWpMissionItems(tenant: string, locale: Locale = "th"): Promise<WpEntry[]> {
  return sortByAcfOrder(await getWpEntries(tenant, "mission-item", locale));
}

export async function getWpOrgUnits(tenant: string, locale: Locale = "th"): Promise<WpEntry[]> {
  return sortByAcfOrder(await getWpEntries(tenant, "org-unit", locale));
}

export async function getWpDocuments(tenant: string): Promise<WpEntry[]> {
  return sortByAcfOrder(await getWpEntries(tenant, "document"));
}

/** Event calendar (Phase 3 gap — see wordpress/mu-plugins/custom-post-types.php's
 * `event` CPT comment) — sorted ascending by `acf.event_date` (ACF's Ymd
 * return format sorts correctly as a plain string), not `sortByAcfOrder`
 * (that's for manually-ordered lists; a calendar orders itself by date). */
export async function getWpEvents(tenant: string): Promise<WpEntry[]> {
  const entries = await getWpEntries(tenant, "event");
  return [...entries].sort((a, b) => String(a.acf?.event_date || "").localeCompare(String(b.acf?.event_date || "")));
}

/** Member/scholar directory (Phase 3 gap — see wordpress/mu-plugins/
 * custom-post-types.php's `member` CPT comment). */
export async function getWpMembers(tenant: string, locale: Locale = "th"): Promise<WpEntry[]> {
  return sortByAcfOrder(await getWpEntries(tenant, "member", locale));
}

/** One native WP `page` by slug, scoped to `tenant` via wtenant — used for
 * hero copy (slug:"home") and About narrative (slug:"about"). Unlike
 * getWpEntries, this fetches a single named entry rather than a list, so it
 * filters by slug directly rather than reusing that helper. Returns null if
 * no page with that slug is tagged for the tenant (page not yet seeded).
 *
 * WP's `page` type enforces a GLOBALLY unique slug regardless of the
 * wtenant taxonomy (confirmed live: seeding "home" for a second tenant
 * silently got auto-suffixed to "home-2" by WP itself) — so the logical
 * per-tenant slug passed in here is prefixed with the tenant key for the
 * actual WP lookup, keeping every tenant's page slugs collision-free. */
export async function getWpPage(tenant: string, slug: string): Promise<WpEntry | null> {
  try {
    const termId = await wtenantId(tenant);
    if (termId == null) return null;
    const wpSlug = tenant + "-" + slug;
    const r = await fetch(
      WORDPRESS + "/wp/v2/pages?wtenant=" + termId + "&slug=" + encodeURIComponent(wpSlug) + "&status=publish&_embed=wp:featuredmedia",
      { headers: { Accept: "application/json" } }
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as any[];
    const p = rows?.[0];
    if (!p) return null;
    return {
      id: p.id,
      title: stripHtml(p.title?.rendered),
      excerpt: stripHtml(p.excerpt?.rendered),
      content: p.content?.rendered || "",
      date: p.date,
      slug: p.slug || "",
      imageUrl: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null,
      acf: p.acf || undefined,
      blocks: parseBlocks(p.acf),
      blocksEn: parseBlocks(p.acf, "blocks_en"),
    };
  } catch {
    return null;
  }
}

export async function getHomeData(tenant: string, engine?: "strapi" | "wordpress") {
  if (engine === "wordpress") {
    const articles = await getWpArticles(tenant);
    return { home: null, services: [], banners: [], articles, videos: [], awards: [], faqs: [] };
  }
  const [home, services, banners, articles, videos, awards, faqs] = await Promise.all([
    get<any[]>("home-pages?populate[hero][populate]=*&populate[featuredPromo][populate]=*&populate[stats]=true&pagination[pageSize]=1", tenant),
    get<any[]>("services?sort=order:asc&pagination[pageSize]=100", tenant),
    get<any[]>("banners?sort=order:asc&populate=image&filters[active][$eq]=true&pagination[pageSize]=100", tenant),
    get<any[]>("articles?sort=publishDate:desc&populate=coverImage&pagination[pageSize]=100", tenant),
    get<any[]>("videos?sort=date:desc&populate=thumbnail&populate=videoFile&pagination[pageSize]=100", tenant),
    get<any[]>("awards?sort=order:asc&populate=image&pagination[pageSize]=100", tenant),
    get<any[]>("faqs?sort=order:asc&pagination[pageSize]=100", tenant),
  ]);
  return {
    home: (home && home[0]) || null,
    services: services || [],
    banners: banners || [],
    articles: articles || [],
    videos: videos || [],
    awards: awards || [],
    faqs: faqs || [],
  };
}

// Block-driven pages — a `page` record is opt-in per tenant+slug: the
// `tenant` query param on `get()` already scopes the read, so a tenant with
// no matching row just gets null back (HomePage.tsx falls through to legacy
// rendering for the homepage slug; the [tenant]/[slug] route 404s otherwise).
export async function getPage(tenant: string, slug: string) {
  const rows = await get<any[]>(
    "pages?filters[slug][$eq]=" + encodeURIComponent(slug) + "&populate[blocks][populate]=*&pagination[pageSize]=1",
    tenant
  );
  return (rows && rows[0]) || null;
}

// For generateStaticParams() on the [tenant]/[slug] route — output:"export"
// requires every route enumerated at build time, so this has to be a real
// list, not just an existence check per-slug the way getPage() is used.
export async function listPageSlugs(tenant: string): Promise<string[]> {
  const rows = await get<any[]>("pages?fields[0]=slug&pagination[pageSize]=100", tenant);
  return (rows || []).map((r) => r.slug).filter(Boolean);
}

/** Every published page slug this tenant owns in WordPress, with the
 * "<tenant>-" prefix stripped so each one matches a route's own [page] param
 * (getWpPage above puts that prefix back on). Exists so a page authored in
 * the Visual Builder gets a real URL: the per-tenant routes used to
 * enumerate a hardcoded map instead, which made any newly created page an
 * orphan with no route at all. Failing soft (empty list) keeps a build
 * working when WordPress is unreachable — the hardcoded pages still ship. */
export async function listWpPageSlugs(tenant: string): Promise<string[]> {
  try {
    const termId = await wtenantId(tenant);
    if (termId == null) return [];
    const r = await fetch(
      WORDPRESS + "/wp/v2/pages?wtenant=" + termId + "&status=publish&per_page=100&_fields=slug",
      { headers: { Accept: "application/json" } }
    );
    if (!r.ok) return [];
    const rows = (await r.json()) as any[];
    const prefix = tenant + "-";
    return (rows || [])
      .map((p) => String(p?.slug || ""))
      .filter((s) => s.startsWith(prefix))
      .map((s) => s.slice(prefix.length))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// block.collection-list's render-time fetch — a raw call against Strapi's
// public REST API (same as every other per-collection call in this file),
// NOT the admin content-manager adapter webx-studio uses: this needs real
// `populate=` support (public-site has no admin session), which only the
// public REST path offers here. `pluralName` is stored on the block itself
// (see webx-studio's VisualBuilder.tsx) since this file can't re-derive a
// uid's REST plural on its own the way the admin schema API can.
export async function getCollectionEntries(
  tenant: string,
  pluralName: string,
  opts: { sortField?: string; sortDir?: "asc" | "desc"; pageSize?: number; populateField?: string }
): Promise<any[]> {
  if (!pluralName) return [];
  const parts: string[] = [];
  if (opts.sortField) parts.push("sort=" + encodeURIComponent(opts.sortField + ":" + (opts.sortDir || "desc")));
  parts.push("pagination[pageSize]=" + (opts.pageSize || 12));
  if (opts.populateField) parts.push("populate=" + encodeURIComponent(opts.populateField));
  const rows = await get<any[]>(pluralName + "?" + parts.join("&"), tenant);
  return rows || [];
}

// Collection Page — the detail-page pair to Collection List. Only
// article/blog carry a real `uid` slug field (verified against every
// schema.json); every other Collection-List-able content type uses Strapi
// 5's own `documentId` as the URL identifier instead — no schema changes,
// a deliberate v1 scope boundary (see the Collection Page plan).
export const SLUGGED_PLURALS = new Set(["articles", "blogs"]);

// generateStaticParams() for the [tenant]/[collection]/[entry] route needs
// every real identifier up front (output:"export" has no on-demand SSR).
export async function listCollectionIdentifiers(tenant: string, pluralName: string): Promise<string[]> {
  if (!pluralName) return [];
  const rows = await get<any[]>(pluralName + "?pagination[pageSize]=200", tenant);
  const useSlug = SLUGGED_PLURALS.has(pluralName);
  // Falls back to documentId per-row when a sluggable type's entry has no
  // slug set (a real, confirmed gap in some seed data, not hypothetical —
  // must match CollectionListBlock's own card-href fallback exactly, or a
  // card would link to a route this never generated.
  return (rows || []).map((r) => (useSlug && r.slug) || r.documentId).filter(Boolean);
}

// One entry by its URL identifier — slug for article/blog (Strapi has no
// direct-by-slug route, so this filters), documentId for everything else
// (Strapi 5's own /api/:plural/:documentId route, no filter needed). An
// identifier that LOOKS like a slug but is actually a documentId (the
// listCollectionIdentifiers fallback above) still resolves: Strapi's own
// documentId format never collides with a slugify()'d string.
export async function getCollectionEntry(
  tenant: string,
  pluralName: string,
  identifier: string,
  populateField?: string
): Promise<any | null> {
  if (!pluralName || !identifier) return null;
  const pop = populateField ? "populate=" + encodeURIComponent(populateField) : "";
  if (SLUGGED_PLURALS.has(pluralName)) {
    const rows = await get<any[]>(
      pluralName + "?filters[slug][$eq]=" + encodeURIComponent(identifier) + (pop ? "&" + pop : "") + "&pagination[pageSize]=1",
      tenant
    );
    if (rows && rows[0]) return rows[0];
  }
  return await get<any>(pluralName + "/" + encodeURIComponent(identifier) + (pop ? "?" + pop : ""), tenant);
}

export type CollectionPageConfig = {
  contentTypeUid: string;
  pluralName: string;
  titleField?: string;
  imageField?: string;
  excerptField?: string;
  dateField?: string;
  bodyField?: string;
  videoUrlField?: string;
  /** the page/landing slug this config came from — used for the detail page's back-link */
  sourceSlug: string;
};

// A Collection Page route is generated once per tenant+content-type, but
// its field mapping lives on a specific `block.collection-list` instance —
// more than one block could bind the same type with different mappings.
// v1 resolution: the first `linkToDetail:true` block found, scanning a
// tenant's pages then landings, wins (documented simplification, not a
// general "collection settings" resolver).
export async function listCollectionPageConfigs(tenant: string): Promise<CollectionPageConfig[]> {
  const [pages, landings] = await Promise.all([
    get<any[]>("pages?populate[blocks][populate]=*&pagination[pageSize]=100", tenant),
    get<any[]>("landings?populate[blocks][populate]=*&pagination[pageSize]=100", tenant),
  ]);
  const out: CollectionPageConfig[] = [];
  const seen = new Set<string>();
  for (const rows of [pages, landings]) {
    for (const row of rows || []) {
      for (const b of row.blocks || []) {
        if (b.__component !== "block.collection-list" || !b.linkToDetail || !b.contentTypeUid || !b.pluralName) continue;
        if (seen.has(b.contentTypeUid)) continue;
        seen.add(b.contentTypeUid);
        out.push({
          contentTypeUid: b.contentTypeUid, pluralName: b.pluralName,
          titleField: b.titleField, imageField: b.imageField, excerptField: b.excerptField,
          dateField: b.dateField, bodyField: b.bodyField, videoUrlField: b.videoUrlField, sourceSlug: row.slug,
        });
      }
    }
  }
  return out;
}

// Keyed by `pluralName`, not `contentTypeUid` — that's what the route's
// [collection] segment actually carries at both build and request time.
export async function getCollectionPageConfig(tenant: string, pluralName: string): Promise<CollectionPageConfig | null> {
  const all = await listCollectionPageConfigs(tenant);
  return all.find((c) => c.pluralName === pluralName) || null;
}

// Header top-nav — api::menu-item.menu-item was originally built for the
// legacy static site's mega-menu (rows with `column` set); a row with
// `column` blank is the new flat top-nav item this reads. See NavManager.tsx
// (webx-studio) for the editor and seedFlatNavItems (strapi-cms) for why
// every existing tenant already has a starting set of these.
// Optional rich dropdown for a flat top-nav item — see strapi-cms's
// menu-item schema's `megaMenu` field and webx-studio's NavManager.tsx for
// the editor. ORST's and RoyalSociety's Header.tsx render this; every other
// template ignores it and shows a plain link.
//
// `children` (optional, recursive) is unlimited-depth menu support — a
// plain Strapi `json` field underneath (not a rigidly-typed Component), so
// this needed no Strapi schema change, only the editor and these two
// renderers understanding the extra field. A link with no children (or an
// empty array) renders exactly as it always has.
export type NavMegaLink = { text: string; url: string; desc?: string; children?: NavMegaLink[] };
export type NavMegaGroup = { heading: string; links: NavMegaLink[] };
export type NavMegaMenu = {
  icon?: string; eyebrow?: string; title?: string; description?: string;
  featuredLabel?: string; featuredUrl?: string; groups: NavMegaGroup[];
};
export type NavItem = { label: string; url: string; openNewTab: boolean; order: number; megaMenu?: NavMegaMenu | null };
export async function getNavItems(tenant: string, locale: Locale = "th"): Promise<NavItem[]> {
  const rows = await get<any[]>("menu-items?sort=order:asc&pagination[pageSize]=50", tenant);
  return (rows || [])
    .filter((r) => !r.column)
    .map((r) => ({
      // Bilingual EN (TOR gap) — labelEn is optional; falls back to the
      // Thai label when blank, same convention as every WP `_en` field.
      label: (locale === "en" && (r.labelEn || "").trim()) || r.label || "",
      url: r.url || "#", openNewTab: !!r.openNewTab, order: r.order ?? 0,
      megaMenu: r.megaMenu && Array.isArray(r.megaMenu.groups) ? (r.megaMenu as NavMegaMenu) : undefined,
    }));
}
