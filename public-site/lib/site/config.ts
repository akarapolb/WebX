// WebX site kit — general features any tenant/template can switch on: site
// search with an index built at export time, static open-data files with a
// catalogue, news index and item pages, a sitemap with hreflang, a 404 page,
// Open Graph image, a dark-mode switch and the "offline" note for blocks that
// need a reachable CMS. A template describes its site once with defineSite()
// and passes the result to the helpers in lib/site/* and components/site/*;
// the look (markup and CSS) stays in the template.
//
// URL scheme (same for every tenant): Thai at /<tenant>/..., English at
// /en/<tenant>/..., the home page is the tenant's `homeSlug` CMS page.
import type { Locale } from "@/lib/cms";

export type Engine = "strapi" | "wordpress";

export type SiteConfig = {
  /** WebX tenant key, also the first path segment. */
  tenant: string;
  /** CMS page used as the home page (default "home"). */
  homeSlug?: string;
  /** Content engine the tenant's news/FAQ come from (default "strapi"). */
  engine?: Engine;
  /** Social-share image, a path under public/ (1200×630). */
  ogImage?: string;
  /** Browser-tab icon, a path under public/ (SVG or PNG). */
  icon?: string;
};

export type Site = Required<Omit<SiteConfig, "ogImage" | "icon">> & {
  ogImage?: string;
  icon?: string;
  /** /<tenant> or /en/<tenant> */
  base: (locale: Locale) => string;
  /** Path of a CMS page; the home slug maps to the base path. */
  pathOf: (locale: Locale, slug?: string) => string;
  searchPath: (locale: Locale) => string;
  searchIndexPath: (locale: Locale) => string;
  newsPath: (locale: Locale, slug?: string) => string;
  dataPath: (locale: Locale) => string;
};

export function defineSite(cfg: SiteConfig): Site {
  const homeSlug = cfg.homeSlug || "home";
  const base = (locale: Locale) => (locale === "en" ? "/en/" : "/") + cfg.tenant;
  return {
    tenant: cfg.tenant,
    homeSlug,
    engine: cfg.engine || "strapi",
    ogImage: cfg.ogImage,
    icon: cfg.icon,
    base,
    pathOf: (locale, slug) => base(locale) + (slug && slug !== homeSlug ? "/" + slug : ""),
    searchPath: (locale) => base(locale) + "/search",
    searchIndexPath: (locale) => base(locale) + "/search-index.json",
    newsPath: (locale, slug) => base(locale) + "/news" + (slug ? "/" + slug : ""),
    dataPath: (locale) => base(locale) + "/data",
  };
}
