// WebX site kit — news: an index (/<tenant>/news) and one page per item
// (/<tenant>/news/<slug>). Items are the tenant's CMS articles; this module is
// the data and metadata side, the template draws the pages (e.g.
// templates/dgahub/News.tsx).
import type { Metadata } from "next";
import { getHomeData, type Locale } from "@/lib/cms";
import type { Site } from "./config";
import { siteMetadata } from "./metadata";

/** Published articles that have a slug (only those can have a page). */
export async function newsArticles(site: Site, locale: Locale): Promise<any[]> {
  const { articles } = await getHomeData(site.tenant, site.engine, locale);
  return (articles || []).filter((a: any) => a?.slug);
}

/** generateStaticParams for news/[slug]. A static export needs at least one
 *  param, so an empty list yields a placeholder that renders notFound(). */
export async function newsParams(site: Site, locale: Locale) {
  const s = (await newsArticles(site, locale)).map((a) => ({ slug: String(a.slug) }));
  return s.length ? s : [{ slug: "_" }];
}

export async function newsMetadata(site: Site, locale: Locale, slug?: string): Promise<Metadata> {
  const m = await siteMetadata(site, locale, "news");
  const name = String(m.openGraph?.siteName || "");
  const a = slug ? (await newsArticles(site, locale)).find((x) => x.slug === slug) : null;
  const title = a ? a.title : locale === "en" ? "News" : "ข่าว";
  const th = site.newsPath("th", slug), en = site.newsPath("en", slug);
  return {
    ...m, title: `${title} · ${name}`, description: a?.excerpt || undefined,
    alternates: { canonical: locale === "en" ? en : th, languages: { th, en } },
    openGraph: { ...m.openGraph, type: a ? "article" : "website", title },
  };
}
