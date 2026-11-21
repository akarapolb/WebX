// WebX site kit — the site search index, built at export time from the same
// CMS content the pages are built from, so search never drifts from what is
// published: one entry per CMS page (its blocks' text), per FAQ and per
// dataset. Served as /<tenant>/search-index.json (and /en/...) and searched in
// the browser (lib/site/search.ts, components/site/useStaticSearch.ts); a
// static site needs no search server.
import { getPage, getHomeData, getDatasets, listPageSlugs, type Locale } from "@/lib/cms";
import type { Site } from "./config";
import type { SearchDoc } from "./search";

export type { SearchDoc };

// Block fields that hold settings, links or ids rather than words a reader sees.
const SKIP = new Set([
  "__component", "id", "documentId", "url", "buttonUrl", "ctaUrl", "icon", "colorTheme", "theme", "style", "size",
  "mode", "columns", "contentTypeUid", "datasetKey", "xField", "yField", "seriesField", "chartType", "image", "full",
  "src", "height", "showDictionary", "headingAccent",
]);

const decode = (s: string) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const plain = (html: string) => decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Collects the reader-visible strings of a block tree. Exported for tests. */
export function blockWords(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") { if (v.trim()) out.push(plain(v)); return out; }
  if (Array.isArray(v)) { v.forEach((x) => blockWords(x, out)); return out; }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) if (!SKIP.has(k)) blockWords(x, out);
  }
  return out;
}

export async function buildSearchIndex(site: Site, locale: Locale): Promise<SearchDoc[]> {
  const en = locale === "en";
  const slugs = await listPageSlugs(site.tenant, locale);
  const pages = (await Promise.all(slugs.map((s) => getPage(site.tenant, s, locale)))).filter(Boolean) as any[];
  const docs: SearchDoc[] = [];
  let faqPath = "", dataPath = "";
  for (const p of pages) {
    const path = site.pathOf(locale, p.slug);
    const blocks: any[] = p.blocks || [];
    if (!faqPath && blocks.some((b) => b.__component === "block.faq")) faqPath = path;
    if (!dataPath && blocks.some((b) => b.__component === "block.dataset-download")) dataPath = path;
    const out: string[] = [];
    if (p.seoDescription) out.push(p.seoDescription);
    blockWords(blocks, out);
    const title = String(p.slug === site.homeSlug ? (en ? "Home" : "หน้าแรก") : p.title || p.slug);
    docs.push({ u: path, t: title, s: title, x: squash(out.join(" ")).slice(0, 6000) });
  }
  const sectionOf = (path: string) => docs.find((d) => d.u === path)?.t || "";

  const { faqs } = await getHomeData(site.tenant, site.engine, locale);
  if (faqPath) {
    for (const f of faqs || []) {
      if (!f?.question) continue;
      docs.push({ u: faqPath, t: String(f.question), s: sectionOf(faqPath), x: squash(plain(String(f.answer || ""))) });
    }
  }

  const datasets = await getDatasets(site.tenant, locale);
  if (dataPath) {
    for (const d of datasets) {
      const cols = d.fields.map((f) => f.label?.[locale] || f.label?.th || f.key).join(", ");
      docs.push({
        u: dataPath, t: d.title, s: sectionOf(dataPath),
        x: squash([d.description, d.sourceName, cols].filter(Boolean).join(" · ")),
      });
    }
  }
  return docs;
}
