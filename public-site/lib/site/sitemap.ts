// WebX site kit — the site's sitemap.xml: every CMS page and news item in both
// languages, each with hreflang alternates. Static file at export time.
import { listPageSlugs } from "@/lib/cms";
import { siteUrlFor } from "@/lib/seo";
import type { Site } from "./config";
import { newsArticles } from "./news";

export async function sitemapXml(site: Site): Promise<string> {
  const origin = siteUrlFor(site.tenant);
  const slugs = await listPageSlugs(site.tenant, "th");
  const news = await newsArticles(site, "th");
  const page = (s: string) => (s === site.homeSlug ? undefined : s);
  const pairs: [string, string][] = [
    ...slugs.map((s) => [site.pathOf("th", page(s)), site.pathOf("en", page(s))] as [string, string]),
    [site.newsPath("th"), site.newsPath("en")],
    ...news.map((a) => [site.newsPath("th", a.slug), site.newsPath("en", a.slug)] as [string, string]),
  ];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const url = (loc: string, th: string, en: string) =>
    `<url><loc>${esc(origin + loc)}</loc>` +
    `<xhtml:link rel="alternate" hreflang="th" href="${esc(origin + th)}"/>` +
    `<xhtml:link rel="alternate" hreflang="en" href="${esc(origin + en)}"/></url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    pairs.flatMap(([th, en]) => [url(th, th, en), url(en, th, en)]).join("\n") + "\n</urlset>\n";
}
