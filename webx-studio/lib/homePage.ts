// Which page should the Visual Builder greet you with?
//
// Its page list is sorted updatedAt:DESC — deliberately, so a page the agent
// has just created or edited lands at the top where the user will look for
// it. The side effect is that the LAST thing anyone touched becomes the
// Builder's landing page, which is wrong whenever that was a throwaway:
// reported live after an import test left a scratch draft as the most
// recently modified page, so opening the Builder for that tenant showed the
// draft instead of the site's own front page.
//
// So the Builder prefers a page that looks like the tenant's home page and
// falls back to the list's own first entry. This lives in lib/ rather than
// beside its caller purely so it's unit-testable without mounting a React
// client component.

/** Slugs that name a front page, once any tenant-key prefix is removed. */
const HOME_SLUGS = new Set(["home", "homepage", "index"]);

/**
 * Does `slug` name `tenantKey`'s front page?
 *
 * WordPress-engine tenants prefix every page slug with their own key —
 * lib/cms/wordpress.ts hands WP's raw slug straight through, so ORST's front
 * page arrives as "orst-home" — while a Strapi page carries the bare slug.
 * Both shapes are accepted rather than branching on the engine here, since
 * this only decides which page opens first: a false negative costs nothing
 * beyond falling back to the most-recently-edited page.
 *
 * No Strapi tenant has a matching page today (their front page is a template,
 * not a page entry), which is exactly why the fallback has to stay.
 */
export function isHomeSlug(slug?: string | null, tenantKey?: string | null): boolean {
  const s = (slug || "").trim().toLowerCase();
  if (!s) return false;
  const key = (tenantKey || "").trim().toLowerCase();
  const bare = key && s.startsWith(key + "-") ? s.slice(key.length + 1) : s;
  return HOME_SLUGS.has(bare);
}

/**
 * The entry the Builder should open first: the tenant's home page if the list
 * holds one, otherwise the list's own first entry (undefined when empty).
 */
export function pickLandingPage<T extends { slug?: string; tenantKey?: string }>(
  pages: readonly T[],
  tenantKey?: string
): T | undefined {
  return pages.find((p) => isHomeSlug(p.slug, p.tenantKey || tenantKey)) || pages[0];
}
