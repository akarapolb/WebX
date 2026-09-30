// The slug a new WordPress page is created with.
//
// WordPress keeps every tenant's pages in one site, so the public site tells
// them apart by a "<tenant>-" prefix on the slug ("orst-about"), and
// public-site/lib/cms.ts's listWpPageSlugs only enumerates slugs that carry
// it. A page created with WordPress's own default — the title, percent-encoded
// for Thai, or nothing at all while it is still a draft — has no prefix, so it
// never gets a route: it exists in the Builder and has no URL on the site.
// That is why the page must be created WITH its slug rather than fixed later.
//
// Kept apart from the component so the rules are testable: a wrong slug here is
// silent (the page saves fine and simply never appears).

/** Words and separators a slug may contain: plain ASCII only. */
const MAX_BASE = 40;

/**
 * An ASCII, lower-case, hyphenated form of `title`, or "" when nothing usable
 * is left. Thai (and any other non-ASCII) letters are dropped rather than
 * transliterated — a slug built from percent-encoded Thai is unreadable and
 * breaks the public route's own plain-slug check.
 */
export function slugify(title: string): string {
  return String(title || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")       // strip accents from Latin letters
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASE)
    .replace(/-+$/g, "");
}

const defaultSuffix = () => Math.random().toString(36).slice(2, 6);

/**
 * `<tenant>-<slug>` for a new page. A title with no ASCII in it (every Thai
 * title) gets `page-<random>` so the page still gets a valid, unique slug —
 * the editor can rename the page freely; the slug is only its address.
 */
export function wpPageSlug(tenantKey: string, title: string, suffix: () => string = defaultSuffix): string {
  const tenant = slugify(tenantKey);
  if (!tenant) throw new Error("A workspace is required to create a page.");
  const base = slugify(title) || `page-${suffix()}`;
  return `${tenant}-${base}`;
}
