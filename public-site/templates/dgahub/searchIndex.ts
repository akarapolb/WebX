// dgahub template — the site search index, built at export time from the same
// WebX content the pages are built from, so search never drifts from what is
// published: one entry per CMS page (its blocks' text), per FAQ and per dataset.
// Served as /dgahub/search-index.json (and /en/...) and searched in the browser
// by Search.tsx; a static site needs no search server.
import { getPage, getHomeData, getDatasets, listPageSlugs, type Locale } from "@/lib/cms";
import { TENANT, HOME_SLUG, pathOf } from "./Site";

/** u: link, t: title, s: section (page the entry belongs to), x: searchable text. */
export type SearchDoc = { u: string; t: string; s: string; x: string };

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

function words(v: unknown, out: string[]) {
  if (typeof v === "string") { if (v.trim()) out.push(plain(v)); return; }
  if (Array.isArray(v)) { v.forEach((x) => words(x, out)); return; }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) if (!SKIP.has(k)) words(x, out);
  }
}

export async function buildSearchIndex(locale: Locale): Promise<SearchDoc[]> {
  const en = locale === "en";
  const slugs = await listPageSlugs(TENANT, locale);
  const pages = (await Promise.all(slugs.map((s) => getPage(TENANT, s, locale)))).filter(Boolean) as any[];
  const docs: SearchDoc[] = [];
  let faqPath = "", dataPath = "";
  for (const p of pages) {
    const path = pathOf(locale, p.slug);
    const blocks: any[] = p.blocks || [];
    if (!faqPath && blocks.some((b) => b.__component === "block.faq")) faqPath = path;
    if (!dataPath && blocks.some((b) => b.__component === "block.dataset-download")) dataPath = path;
    const out: string[] = [];
    if (p.seoDescription) out.push(p.seoDescription);
    words(blocks, out);
    const title = String(p.slug === HOME_SLUG ? (en ? "Home" : "หน้าแรก") : p.title || p.slug);
    docs.push({ u: path, t: title, s: title, x: squash(out.join(" ")).slice(0, 6000) });
  }
  const sectionOf = (path: string) => docs.find((d) => d.u === path)?.t || "";

  const { faqs } = await getHomeData(TENANT, "strapi", locale);
  if (faqPath) {
    for (const f of faqs || []) {
      if (!f?.question) continue;
      docs.push({ u: faqPath, t: String(f.question), s: sectionOf(faqPath), x: squash(plain(String(f.answer || ""))) });
    }
  }

  const datasets = await getDatasets(TENANT, locale);
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
