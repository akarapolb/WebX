// block.chart — a line or bar chart drawn from a Dataset (Data Hub), rendered
// to static SVG at build time. WCAG 2.1 AA: the SVG has a text title and
// description, colour is never the only cue (the focus series is thicker, the
// others dashed, and every point has a label in the table), and the full
// numbers are always available in a real <table> below the chart.
import type { Dataset, DatasetField } from "@/lib/cms";
import { fmtNumber, t, type Locale } from "@/lib/i18n";

const COLORS = ["var(--dh-c1)", "var(--dh-c2)", "var(--dh-c3)", "var(--dh-c4)", "var(--dh-c5)", "var(--dh-c6)"];

/** "index=EGDI;country=THA,SGP" → row predicate. Unknown fields simply match nothing. */
export function rowFilter(spec?: string): (r: Record<string, any>) => boolean {
  const clauses = String(spec || "").split(";").map((c) => c.trim()).filter(Boolean).map((c) => {
    const [k, v = ""] = c.split("=");
    return { k: k.trim(), vs: new Set(v.split(",").map((x) => x.trim()).filter(Boolean)) };
  });
  return (r) => clauses.every(({ k, vs }) => vs.has(String(r[k])));
}

export function fieldLabel(f: DatasetField | undefined, key: string, locale: Locale): string {
  return f?.label?.[locale] || f?.label?.th || key;
}

/** Display value of a cell: valueLabels (e.g. THA → Thailand) for codes, locale number format for numbers. */
export function cellText(f: DatasetField | undefined, v: any, locale: Locale): string {
  if (v == null || v === "") return "–";
  const vl = f?.valueLabels?.[String(v)];
  if (vl) return vl[locale] || vl.th || String(v);
  if (f?.type === "number") return fmtNumber(Number(v), locale, decimals(f));
  return String(v);
}
const decimals = (f?: DatasetField) => (f?.unit === "score" || f?.key === "score" ? 4 : undefined);

function niceRange(vals: number[], invert: boolean): [number, number] {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  if (!invert && lo < 0 && Math.min(...vals) >= 0) lo = 0;
  if (invert) lo = Math.max(lo, 0);
  return [lo, hi];
}

export default function ChartBlock({ b, dataset, locale }: { b: any; dataset?: Dataset; locale: Locale }) {
  const id = "dh-chart-" + String(b.id ?? b.datasetKey ?? "x").replace(/\W+/g, "-");
  const head = (b.eyebrow || b.title || b.intro) && (
    <div className="block__head">
      <div>
        {b.eyebrow && <span className="eyebrow">{b.eyebrow}</span>}
        {b.title && <h2 id={id + "-h"}>{b.title}</h2>}
        {b.intro && <p className="dh-intro">{b.intro}</p>}
      </div>
    </div>
  );
  const fields = new Map((dataset?.fields || []).map((f) => [f.key, f]));
  const rows = (dataset?.rows || []).filter(rowFilter(b.filter)).filter((r) => r[b.yField] != null && isFinite(Number(r[b.yField])));
  if (!dataset || !rows.length) {
    return (
      <section className="block dh-block" aria-labelledby={b.title ? id + "-h" : undefined}>
        {head}
        <p className="dh-empty">{t("noData", locale)}</p>
      </section>
    );
  }

  const xF = fields.get(b.xField), yF = fields.get(b.yField), sF = b.seriesField ? fields.get(b.seriesField) : undefined;
  const yLabel = fieldLabel(yF, b.yField, locale);
  const invert = !!b.invertY;
  const fmtY = (v: number) => cellText(yF, v, locale);
  const title = b.title || dataset.title;

  // Series: split by seriesField (first-seen order), else one series.
  const seriesKeys: string[] = [];
  for (const r of rows) {
    const k = b.seriesField ? String(r[b.seriesField]) : "_";
    if (!seriesKeys.includes(k)) seriesKeys.push(k);
  }
  // The dataset's own "focus" value (e.g. the home country) is drawn first and emphasised.
  const focus = sF?.valueLabels ? Object.keys(sF.valueLabels).find((k) => (sF.valueLabels as any)[k]?.focus) : undefined;
  if (focus && seriesKeys.includes(focus)) seriesKeys.splice(seriesKeys.indexOf(focus), 1), seriesKeys.unshift(focus);
  const seriesName = (k: string) => (k === "_" ? yLabel : cellText(sF, k, locale));

  const W = 640, H = 300, P = { l: 56, r: 16, t: 24, b: 36 };
  const yVals = rows.map((r) => Number(r[b.yField]));
  const [yMin, yMax] = niceRange(yVals, invert);
  const yPos = (v: number) => {
    const f = (v - yMin) / (yMax - yMin);
    return invert ? P.t + f * (H - P.t - P.b) : H - P.b - f * (H - P.t - P.b);
  };
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const tickText = (v: number) => (yF?.type === "integer" ? String(Math.round(v)) : fmtNumber(v, locale, Math.abs(yMax - yMin) < 2 ? 2 : 0));

  let plot: React.ReactNode;
  let desc: string;
  if (b.chartType === "bar") {
    // Horizontal bars, one per row (sorted best-first), labelled with the x field.
    const sorted = rows.slice().sort((a, c) => (invert ? Number(a[b.yField]) - Number(c[b.yField]) : Number(c[b.yField]) - Number(a[b.yField])));
    const max = Math.max(...yVals);
    desc = sorted.map((r) => cellText(xF, r[b.xField], locale) + " " + fmtY(Number(r[b.yField]))).join("; ");
    plot = (
      <ul className="dh-bars" aria-hidden="true">
        {sorted.map((r, i) => {
          const v = Number(r[b.yField]);
          const pct = invert ? (Math.min(...yVals) / v) * 100 : (v / max) * 100;
          const isFocus = focus && String(r[b.xField]) === focus;
          return (
            <li key={i} className={isFocus ? "is-focus" : undefined}>
              <span className="dh-bar-label">{cellText(xF, r[b.xField], locale)}</span>
              <span className="dh-bar-track"><span style={{ width: Math.max(2, pct) + "%" }} /></span>
              <b className="dh-bar-val">{fmtY(v)}</b>
            </li>
          );
        })}
      </ul>
    );
  } else {
    const xs = [...new Set(rows.map((r) => Number(r[b.xField])))].sort((a, c) => a - c);
    const xPos = (v: number) => P.l + (xs.length === 1 ? (W - P.l - P.r) / 2 : ((v - xs[0]) / (xs[xs.length - 1] - xs[0])) * (W - P.l - P.r));
    desc = seriesKeys.map((k) => seriesName(k) + ": " + rows.filter((r) => (b.seriesField ? String(r[b.seriesField]) : "_") === k)
      .sort((a, c) => Number(a[b.xField]) - Number(c[b.xField])).map((r) => r[b.xField] + " " + fmtY(Number(r[b.yField]))).join(", ")).join(". ");
    plot = (
      <svg className="dh-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{desc}</desc>
        {ticks.map((v) => (
          <g key={v}>
            <line className="dh-grid" x1={P.l} x2={W - P.r} y1={yPos(v)} y2={yPos(v)} />
            <text x={P.l - 8} y={yPos(v) + 4} textAnchor="end">{tickText(v)}</text>
          </g>
        ))}
        {xs.map((v) => <text key={v} x={xPos(v)} y={H - 12} textAnchor="middle">{v}</text>)}
        {seriesKeys.map((k, i) => {
          const pts = rows.filter((r) => (b.seriesField ? String(r[b.seriesField]) : "_") === k)
            .map((r) => ({ x: Number(r[b.xField]), y: Number(r[b.yField]) })).sort((a, c) => a.x - c.x);
          const emph = i === 0;
          const c = COLORS[i % COLORS.length];
          const d = pts.map((p, j) => `${j ? "L" : "M"}${xPos(p.x).toFixed(1)},${yPos(p.y).toFixed(1)}`).join(" ");
          return (
            <g key={k}>
              <path d={d} fill="none" stroke={c} strokeWidth={emph ? 3.5 : 2} strokeDasharray={emph ? undefined : i % 2 ? "6 4" : "2 3"} />
              {pts.map((p) => <circle key={p.x} cx={xPos(p.x)} cy={yPos(p.y)} r={emph ? 5 : 3.5} fill={c} />)}
              {emph && pts.map((p) => (
                <text key={"l" + p.x} className="dh-pt" x={xPos(p.x)} y={yPos(p.y) - 10} textAnchor="middle">{fmtY(p.y)}</text>
              ))}
            </g>
          );
        })}
      </svg>
    );
  }

  // Table: one row per x value, one column per series (or the plain rows for bars).
  const tableCols = b.chartType === "bar" || !b.seriesField
    ? [b.xField, b.yField]
    : [b.xField, ...seriesKeys];
  const tableRows: string[][] = b.chartType === "bar" || !b.seriesField
    ? rows.map((r) => [cellText(xF, r[b.xField], locale), fmtY(Number(r[b.yField]))])
    : [...new Set(rows.map((r) => r[b.xField]))].sort().map((x) => [
        String(x),
        ...seriesKeys.map((k) => {
          const r = rows.find((rr) => rr[b.xField] === x && String(rr[b.seriesField]) === k);
          return r ? fmtY(Number(r[b.yField])) : "–";
        }),
      ]);
  const colLabel = (c: string, i: number) =>
    i === 0 ? fieldLabel(xF, b.xField, locale) : b.chartType === "bar" || !b.seriesField ? yLabel : seriesName(c);

  return (
    <section className="block dh-block" aria-labelledby={b.title ? id + "-h" : undefined}>
      {head}
      <figure className="dh-figure">
        {plot}
        {b.chartType !== "bar" && seriesKeys.length > 1 && (
          <ul className="dh-legend" aria-hidden="true">
            {seriesKeys.map((k, i) => (
              <li key={k}><span className={"dh-sw" + (i === 0 ? " is-focus" : i % 2 ? " is-dash" : " is-dot")} style={{ borderColor: COLORS[i % COLORS.length] }} />{seriesName(k)}</li>
            ))}
          </ul>
        )}
        <figcaption className="dh-caption">
          {invert && <span>{t("rankNote", locale)} · </span>}
          {t("source", locale)}: {dataset.sourceUrl
            ? <a href={dataset.sourceUrl} rel="noopener">{dataset.sourceName || dataset.sourceUrl}</a>
            : dataset.sourceName || "–"}
          {dataset.verified === false && <span className="dh-unverified"> · {t("unverified", locale)}</span>}
        </figcaption>
      </figure>
      {b.showTable !== false && (
        <details className="dh-table">
          <summary>{t("showTable", locale)}</summary>
          <div className="dh-table-scroll">
            <table>
              <caption className="visually-hidden">{title} — {t("dataTable", locale)}</caption>
              <thead><tr>{tableCols.map((c, i) => <th key={c} scope="col" className={i ? "num" : undefined}>{colLabel(c, i)}</th>)}</tr></thead>
              <tbody>{tableRows.map((r, i) => (
                <tr key={i}>{r.map((v, j) => j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j} className="num">{v}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
