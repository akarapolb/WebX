// block.dataset-download — open-data downloads for a tenant's Datasets: a CSV
// file (UTF-8 with BOM so Excel opens Thai correctly), the live JSON from the
// public REST API, and a data dictionary. Static export has no server, so the
// CSV is embedded as a data: URL at build time; datasets here are small
// (hundreds of rows), well inside what a data: URL handles.
import { datasetApiUrl, type Dataset } from "@/lib/cms";
import { fmtDate, t, type Locale } from "@/lib/i18n";
import { fieldLabel } from "./ChartBlock";

export function toCsv(d: Dataset): string {
  const cols = d.fields.length ? d.fields.map((f) => f.key) : Object.keys(d.rows[0] || {});
  const q = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return "﻿" + [cols.join(","), ...d.rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\r\n");
}

/** `links` lets a template serve the files itself (dgahub: static files written
 *  at export time) instead of a data: URL and the CMS's live REST API. */
export default function DatasetDownloadBlock({ b, datasets, tenant, locale, links }: {
  b: any; datasets: Dataset[]; tenant: string; locale: Locale;
  links?: { csv: (d: Dataset) => string; json: (d: Dataset) => string };
}) {
  const wanted = String(b.datasetKeys || "").split(",").map((s) => s.trim()).filter(Boolean);
  const list = wanted.length ? wanted.map((k) => datasets.find((d) => d.key === k)).filter(Boolean) as Dataset[] : datasets;
  if (!list.length) return null;
  const hid = "dh-dl-" + String(b.id ?? "x");
  return (
    <section className="block dh-block" aria-labelledby={b.title ? hid : undefined}>
      {(b.eyebrow || b.title || b.intro) && (
        <div className="block__head"><div>
          {b.eyebrow && <span className="eyebrow">{b.eyebrow}</span>}
          {b.title && <h2 id={hid}>{b.title}</h2>}
          {b.intro && <p className="dh-intro">{b.intro}</p>}
        </div></div>
      )}
      <ul className="dh-datasets">
        {list.map((d) => (
          <li key={d.key} className="dh-dataset" id={"dataset-" + d.key}>
            <h3>{d.title}</h3>
            {d.description && <p>{d.description}</p>}
            <p className="dh-meta">
              {d.rows.length} {t("records", locale)}
              {d.sourceName && <> · {t("source", locale)}: {d.sourceName}</>}
              {d.license && <> · {t("license", locale)}: {d.license}</>}
              {d.updatedOn && <> · {t("updated", locale)} {fmtDate(d.updatedOn, locale)}</>}
              {d.updateCycle && <> ({d.updateCycle})</>}
            </p>
            {d.verified === false && <p className="dh-unverified">{t("unverified", locale)}</p>}
            <p className="dh-actions">
              <a className="btn btn--primary" href={links ? links.csv(d) : "data:text/csv;charset=utf-8," + encodeURIComponent(toCsv(d))} download={d.key + ".csv"}>
                {t("download", locale)} CSV<span className="visually-hidden">: {d.title}</span>
              </a>
              <a className="btn btn--ghost" href={links ? links.json(d) : datasetApiUrl(tenant, d.key, locale)} rel="noopener">
                {t("api", locale)}<span className="visually-hidden">: {d.title}</span>
              </a>
            </p>
            {b.showDictionary !== false && d.fields.length > 0 && (
              <details className="dh-table">
                <summary>{t("dictionary", locale)}</summary>
                <div className="dh-table-scroll">
                  <table>
                    <caption className="visually-hidden">{t("dictionary", locale)}: {d.title}</caption>
                    <thead><tr><th scope="col">{t("field", locale)}</th><th scope="col">{t("meaning", locale)}</th><th scope="col">{t("type", locale)}</th></tr></thead>
                    <tbody>{d.fields.map((f) => (
                      <tr key={f.key}><th scope="row"><code>{f.key}</code></th><td>{fieldLabel(f, f.key, locale)}{f.unit ? " (" + f.unit + ")" : ""}</td><td>{f.type || "string"}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
