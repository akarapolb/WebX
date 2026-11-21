// WebX site kit — handlers for a template's static route files, so wiring a
// feature into a new template is a few lines per route:
//
//   // app/<tenant>/search-index.json/route.ts
//   export const dynamic = "force-static";
//   export const GET = searchIndexRoute(site, "th");
//
//   // app/<tenant>/data/[file]/route.ts
//   export const dynamic = "force-static"; export const dynamicParams = false;
//   const r = dataRoute(site, "th");
//   export const generateStaticParams = r.generateStaticParams;
//   export const GET = r.GET;
//
//   // app/<tenant>/sitemap.xml/route.ts
//   export const dynamic = "force-static";
//   export const GET = sitemapRoute(site);
//
// (`dynamic`/`dynamicParams` must stay literal exports in the route file:
// Next reads them statically.)
import type { Locale } from "@/lib/cms";
import type { Site } from "./config";
import { buildSearchIndex } from "./searchIndex";
import { dataFiles, dataFile } from "./openData";
import { sitemapXml } from "./sitemap";

export const searchIndexRoute = (site: Site, locale: Locale) => async () => Response.json(await buildSearchIndex(site, locale));

export function dataRoute(site: Site, locale: Locale) {
  return {
    generateStaticParams: async () => (await dataFiles(site, locale)).map((file) => ({ file })),
    GET: async (_req: Request, { params }: { params: Promise<{ file: string }> }) => dataFile(site, locale, (await params).file),
  };
}

export const sitemapRoute = (site: Site) => async () =>
  new Response(await sitemapXml(site), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
