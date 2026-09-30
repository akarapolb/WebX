// Where a published entry can be read on the public site.
//
// Used to put a real link on a release once it has published, so an editor
// can go straight from "this went out" to the page a visitor sees instead of
// reconstructing the URL by hand.
//
// Returns a PATH, never a full URL: the origin differs per deployment (and
// between the dev server and a built site), so callers join it with their own
// base. That also means a path stored on a release row stays correct if the
// public site later moves to a real domain.
//
// Only page types get a link. Collection entries (news, services, …) do have
// detail routes, but only when that tenant has a collection page configured
// for the type — public-site/app/(gov-portal)/[tenant]/[slug]/[entry] builds
// its params from listCollectionPageConfigs — so guessing a URL for them
// would produce dead links for every type that isn't set up. No link is
// better than a 404.

/** A page entry, as either engine's adapter returns it. */
export type UrlEntry = {
  slug?: string | null;
  /** WordPress pages carry this directly (derived from the wtenant term). */
  tenantKey?: string | null;
  /** Strapi pages carry a relation instead; shape varies by populate depth. */
  tenant?: { key?: string | null } | string | null;
};

/** The gov-portal slug whose page is served at /{tenant}, not /{tenant}/{slug}. */
const GOV_HOME_SLUG = "home-blocks";
/** Its WordPress-template equivalent, after the tenant prefix is stripped. */
const WP_HOME_SLUG = "home";

/** Path segments are interpolated into a link, so keep them to plain slugs. */
const SEGMENT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/** The tenant key an entry belongs to, whichever shape the adapter used. */
export function tenantKeyOf(e: UrlEntry | null | undefined): string | null {
  if (!e) return null;
  if (typeof e.tenantKey === "string" && e.tenantKey) return e.tenantKey;
  const t = e.tenant;
  if (typeof t === "string" && t) return t;
  if (t && typeof t === "object" && typeof t.key === "string" && t.key) return t.key;
  return null;
}

/**
 * The public-site path for a published entry, or null when it has none.
 *
 * `contentType` is the UID the release item stored — "wp:page" for a
 * WordPress-engine tenant, "api::page.page" for a Strapi one.
 */
export function publicPagePath(contentType: string | null | undefined, entry: UrlEntry | null | undefined): string | null {
  const tenant = tenantKeyOf(entry);
  const slug = typeof entry?.slug === "string" ? entry.slug.trim() : "";
  if (!tenant || !slug || !SEGMENT_RE.test(tenant)) return null;

  if (contentType === "wp:page") {
    // WordPress keeps every tenant's pages in one site, so their slugs are
    // prefixed with the tenant key ("orst-about"). The route's own [page]
    // param is the part after that prefix — see public-site/lib/cms.ts's
    // listWpPageSlugs, which strips it the same way.
    const prefix = tenant.toLowerCase() + "-";
    if (!slug.toLowerCase().startsWith(prefix)) return null;
    const page = slug.slice(prefix.length);
    if (!page || !SEGMENT_RE.test(page)) return null;
    return page.toLowerCase() === WP_HOME_SLUG ? `/${tenant}` : `/${tenant}/${page}`;
  }

  if (contentType === "api::page.page") {
    if (!SEGMENT_RE.test(slug)) return null;
    return slug === GOV_HOME_SLUG ? `/${tenant}` : `/${tenant}/${slug}`;
  }

  return null;
}

/** Joins a path from publicPagePath onto a site origin. */
export function publicPageUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}
