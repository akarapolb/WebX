import { listPageSlugs } from "@/lib/cms";
import { siteUrlFor } from "@/lib/seo";
import { TENANT, HOME_SLUG, pathOf } from "@/templates/dgahub/Site";
import { newsSlugs, newsPath } from "@/templates/dgahub/News";

// The hub's sitemap, both languages, with hreflang alternates. Static file at export time.
export const dynamic = "force-static";

export async function GET() {
  const origin = siteUrlFor(TENANT);
  const slugs = await listPageSlugs(TENANT, "th");
  const news = await newsSlugs("th");
  const pairs: [string, string][] = [
    ...slugs.map((s) => [pathOf("th", s === HOME_SLUG ? undefined : s), pathOf("en", s === HOME_SLUG ? undefined : s)] as [string, string]),
    [newsPath("th"), newsPath("en")],
    ...news.map(({ slug }) => [newsPath("th", slug), newsPath("en", slug)] as [string, string]),
  ];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const url = (loc: string, th: string, en: string) =>
    `<url><loc>${esc(origin + loc)}</loc>` +
    `<xhtml:link rel="alternate" hreflang="th" href="${esc(origin + th)}"/>` +
    `<xhtml:link rel="alternate" hreflang="en" href="${esc(origin + en)}"/></url>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    pairs.flatMap(([th, en]) => [url(th, th, en), url(en, th, en)]).join("\n") + "\n</urlset>\n";
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
