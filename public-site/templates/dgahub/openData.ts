// dgahub template — open data as static files, written at export time from the
// tenant's WebX Datasets, so the "open API" works on any static host with no
// server behind it:
//   /dgahub/data/catalog.json        list of datasets (DCAT-style fields)
//   /dgahub/data/<key>.json          one dataset: metadata, data dictionary, rows
//   /dgahub/data/<key>.csv           the rows as CSV (UTF-8 with BOM for Excel)
// /en/dgahub/data/... carries the English titles and column names.
import { getDatasets, type Dataset, type Locale } from "@/lib/cms";
import { toCsv } from "@/components/blocks/DatasetDownloadBlock";
import { siteUrlFor } from "@/lib/seo";
import { TENANT, base } from "./Site";

const dataPath = (locale: Locale) => base(locale) + "/data";

function meta(d: Dataset, locale: Locale) {
  const url = siteUrlFor(TENANT) + dataPath(locale);
  return {
    key: d.key,
    title: d.title,
    description: d.description || null,
    publisher: d.sourceName || null,
    source: d.sourceUrl || null,
    license: d.license || null,
    modified: d.updatedOn || null,
    accrualPeriodicity: d.updateCycle || null,
    verified: d.verified !== false,
    records: d.rows.length,
    distribution: [
      { format: "JSON", mediaType: "application/json", downloadURL: `${url}/${d.key}.json` },
      { format: "CSV", mediaType: "text/csv", downloadURL: `${url}/${d.key}.csv` },
    ],
  };
}

/** Every file name under /data for a locale. */
export async function dataFiles(locale: Locale): Promise<string[]> {
  const ds = await getDatasets(TENANT, locale);
  return ["catalog.json", ...ds.flatMap((d) => [`${d.key}.json`, `${d.key}.csv`])];
}

export async function dataFile(locale: Locale, file: string): Promise<Response> {
  const ds = await getDatasets(TENANT, locale);
  if (file === "catalog.json") {
    return Response.json({ language: locale, datasets: ds.map((d) => meta(d, locale)) });
  }
  const m = /^(.+)\.(json|csv)$/.exec(file);
  const d = m && ds.find((x) => x.key === m[1]);
  if (!m || !d) return new Response("Not found", { status: 404 });
  if (m[2] === "csv") return new Response(toCsv(d), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
  return Response.json({
    ...meta(d, locale),
    fields: d.fields.map((f) => ({ key: f.key, label: f.label?.[locale] || f.label?.th || f.key, type: f.type || "string", unit: f.unit || null })),
    rows: d.rows,
  });
}
