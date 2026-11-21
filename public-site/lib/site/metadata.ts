// WebX site kit — page metadata for a CMS-driven bilingual site: title, the
// page's SEO description, canonical + hreflang (th/en), Open Graph with the
// site's share image, and a Twitter large card. Server-only.
import type { Metadata } from "next";
import { getTenant, getPage, type Locale } from "@/lib/cms";
import { siteUrlFor } from "@/lib/seo";
import type { Site } from "./config";

export async function siteName(site: Site, locale: Locale): Promise<string> {
  const [home, tenant] = await Promise.all([getPage(site.tenant, site.homeSlug, locale), getTenant(site.tenant)]);
  return String(home?.title || tenant?.name || site.tenant);
}

/** Open Graph / Twitter image fields for a site, empty when it has none. */
export function ogImageFields(site: Site): Pick<Metadata, "twitter"> & { images?: { url: string; width: number; height: number }[] } {
  return site.ogImage
    ? { images: [{ url: site.ogImage, width: 1200, height: 630 }], twitter: { card: "summary_large_image", images: [site.ogImage] } }
    : {};
}

export async function siteMetadata(site: Site, locale: Locale, slug?: string): Promise<Metadata> {
  const [page, name] = await Promise.all([getPage(site.tenant, slug || site.homeSlug, locale), siteName(site, locale)]);
  const isHome = !slug || slug === site.homeSlug;
  const th = site.pathOf("th", slug), en = site.pathOf("en", slug);
  const { images, twitter } = ogImageFields(site);
  return {
    title: isHome ? name : `${page?.title || slug} · ${name}`,
    description: page?.seoDescription || undefined,
    alternates: { canonical: locale === "en" ? en : th, languages: { th, en } },
    openGraph: { siteName: name, locale: locale === "en" ? "en_GB" : "th_TH", type: "website", images },
    twitter,
    metadataBase: new URL(siteUrlFor(site.tenant)),
    ...(site.icon ? { icons: { icon: site.icon } } : {}),
  };
}

/** Metadata for the site's search page (not indexed). */
export async function searchMetadata(site: Site, locale: Locale): Promise<Metadata> {
  const m = await siteMetadata(site, locale, "search");
  return { ...m, title: (locale === "en" ? "Search" : "ค้นหา") + " · " + String(m.openGraph?.siteName || ""), robots: { index: false } };
}
