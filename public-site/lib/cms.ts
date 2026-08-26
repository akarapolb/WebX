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
const FALLBACK_TENANTS: TenantKeyInfo[] = [
  { key: "dga", publicTemplate: "gov-portal" },
  { key: "pea", publicTemplate: "gov-portal" },
];

/** Every known active tenant, with enough to route + template-select at
 * build time. Backed by Strapi's public GET /api/tenants/keys (Phase 6/8);
 * falls back to the two original demo tenants if that's unreachable at
 * build time, so a Strapi outage doesn't drop pages that already existed. */
export async function listTenants(): Promise<TenantKeyInfo[]> {
  try {
    const r = await fetch(STRAPI + "/api/tenants/keys", { headers: { Accept: "application/json" } });
    if (!r.ok) return FALLBACK_TENANTS;
    const j = await r.json();
    const list = ((j?.data as any[]) || []).filter((t) => t?.key) as TenantKeyInfo[];
    return list.length ? list : FALLBACK_TENANTS;
  } catch {
    return FALLBACK_TENANTS;
  }
}

export async function getTenant(key: string): Promise<Tenant | null> {
  return get<Tenant>("tenants/resolve", key).then((t) => t as any);
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
};

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
async function getWpEntries(tenant: string, restBase: string): Promise<WpEntry[]> {
  try {
    const termId = await wtenantId(tenant);
    if (termId == null) return [];
    const r = await fetch(WORDPRESS + "/wp/v2/" + restBase + "?wtenant=" + termId + "&per_page=50&status=publish&_embed=wp:featuredmedia", { headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const rows = (await r.json()) as any[];
    return (rows || []).map((p) => ({
      id: p.id,
      title: stripHtml(p.title?.rendered),
      excerpt: stripHtml(p.excerpt?.rendered),
      content: p.content?.rendered || "",
      date: p.date,
      slug: p.slug || "",
      imageUrl: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null,
      acf: p.acf || undefined,
    }));
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

export async function getWpServices(tenant: string): Promise<WpEntry[]> {
  return getWpEntries(tenant, "service");
}

export async function getWpPublications(tenant: string): Promise<WpEntry[]> {
  return getWpEntries(tenant, "publication");
}

export async function getWpFaqs(tenant: string): Promise<WpEntry[]> {
  return getWpEntries(tenant, "faq");
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

export async function getWpMissionItems(tenant: string): Promise<WpEntry[]> {
  return sortByAcfOrder(await getWpEntries(tenant, "mission-item"));
}

export async function getWpOrgUnits(tenant: string): Promise<WpEntry[]> {
  return sortByAcfOrder(await getWpEntries(tenant, "org-unit"));
}

export async function getWpDocuments(tenant: string): Promise<WpEntry[]> {
  return sortByAcfOrder(await getWpEntries(tenant, "document"));
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
    get<any[]>("videos?sort=date:desc&populate=thumbnail&pagination[pageSize]=100", tenant),
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
