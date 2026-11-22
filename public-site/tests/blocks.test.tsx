// Block rendering: the dgahub template's Blocks and WebX's ChartBlock, rendered
// to HTML the way the static export does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import Blocks from "@/templates/dgahub/Blocks";
import ChartBlock, { rowFilter, cellText, isScoreAxis } from "@/components/blocks/ChartBlock";
import { egdi } from "./fixtures";

const ctx = { locale: "en" as const, tenant: "dgahub", home: "/en/dgahub", datasets: [egdi], articles: [], faqs: [] };
const render = (blocks: any[], isHome = false) => renderToStaticMarkup(<Blocks blocks={blocks} isHome={isHome} {...ctx} />);

test("home hero takes the following stat row as its KPI cards", () => {
  const html = render([
    { __component: "block.hero", heading: "Digital government", headingAccent: "of Thailand", kicker: "Hub", ctaLabel: "See indices", ctaUrl: "/dgahub/indices" },
    { __component: "block.stat-row", items: [{ label: "EGDI rank", value: "#72" }, { label: "Score", value: "0.7732" }] },
  ], true);
  assert.match(html, /<h1 id="hero-title">Digital government<em>of Thailand<\/em><\/h1>/);
  assert.equal((html.match(/class="kpi"/g) || []).length, 2, "two KPI cards inside the hero");
  assert.ok(!html.includes('class="section'), "no separate stat-row section");
  assert.match(html, /href="\/en\/dgahub\/indices"/, "CTA link localised to English");
});

test("inner page hero becomes a page header with a breadcrumb", () => {
  const html = render([{ __component: "block.hero", heading: "Global indices", kicker: "Indices" }]);
  assert.match(html, /<nav class="crumbs" aria-label="Breadcrumb">/);
  assert.match(html, /<h1>Global indices<\/h1>/);
});

test("rich text is sanitised", () => {
  const html = render([{ __component: "block.richtext", body: '<p>Safe</p><script>alert(1)</script><img src=x onerror="alert(1)">' }]);
  assert.match(html, /<p>Safe<\/p>/);
  assert.ok(!/<script>alert/.test(html), "script removed");
  assert.ok(!/onerror/.test(html), "event handler removed");
});

test("unknown blocks are skipped, sections alternate backgrounds", () => {
  const html = render([
    { __component: "block.richtext", body: "<p>A</p>" },
    { __component: "block.no-such-block", text: "ignored" },
    { __component: "block.richtext", body: "<p>B</p>" },
  ]);
  assert.ok(!html.includes("ignored"));
  assert.deepEqual(html.match(/class="section( alt)?"/g), ['class="section"', 'class="section alt"']);
});

test("two charts in a row form one dashboard grid", () => {
  const chart = { __component: "block.chart", datasetKey: "egdi", xField: "year", yField: "score", seriesField: "country", title: "EGDI" };
  const html = render([chart, { ...chart, id: 2 }]);
  assert.equal((html.match(/dh-dash/g) || []).length, 1);
  assert.equal((html.match(/<svg class="dh-svg"/g) || []).length, 2);
});

test("dataset download links to the static files", () => {
  const html = render([{ __component: "block.dataset-download", datasetKeys: "egdi", title: "Downloads" }]);
  assert.match(html, /href="\/en\/dgahub\/data\/egdi\.csv"/);
  assert.match(html, /href="\/en\/dgahub\/data\/egdi\.json"/);
});

test("line chart: accessible SVG, data table, focus series first, last label anchored inside", () => {
  const html = renderToStaticMarkup(<ChartBlock b={{ id: 1, datasetKey: "egdi", xField: "year", yField: "score", seriesField: "country", title: "EGDI score" }} dataset={egdi} locale="en" />);
  assert.match(html, /<svg class="dh-svg"[^>]*role="img"/);
  assert.match(html, /<title id="dh-chart-1-t">EGDI score<\/title>/);
  assert.match(html, /<desc id="dh-chart-1-d">Thailand: 2022 0\.7660, 2024 0\.8351, 2026 0\.7732\. Singapore/);
  assert.match(html, /<table>/);
  const labels = [...html.matchAll(/<text class="dh-pt" x="([\d.]+)"[^>]*text-anchor="(\w+)">([^<]+)</g)];
  const last = labels.at(-1)!;
  assert.equal(last[3], "0.7732");
  assert.equal(last[2], "end", "last value label is anchored at its end so it stays inside the 640px plot");
  assert.ok(Number(last[1]) <= 640);
});

test("score charts use a fixed 0–1.0 axis; rank charts keep their fitted axis", () => {
  const ticks = (html: string) => [...html.matchAll(/<text x="48" y="[\d.]+" text-anchor="end">([^<]+)</g)].map((m) => m[1]);
  const score = renderToStaticMarkup(<ChartBlock b={{ id: 2, datasetKey: "egdi", xField: "year", yField: "score", seriesField: "country" }} dataset={egdi} locale="en" />);
  assert.deepEqual(ticks(score), ["0.0", "0.2", "0.4", "0.6", "0.8", "1.0"]);
  const ranked = { ...egdi, fields: [...egdi.fields, { key: "rank", type: "integer" }], rows: egdi.rows.map((r, i) => ({ ...r, rank: 40 + i * 3 })) } as any;
  const rank = renderToStaticMarkup(<ChartBlock b={{ id: 3, datasetKey: "egdi", xField: "year", yField: "rank", seriesField: "country", invertY: true }} dataset={ranked} locale="en" />);
  assert.ok(!ticks(rank).includes("1.0") && ticks(rank).length === 5, "rank axis is not capped");
  const bars = renderToStaticMarkup(<ChartBlock b={{ id: 4, datasetKey: "egdi", chartType: "bar", xField: "country", yField: "score", filter: "year=2026" }} dataset={egdi} locale="en" />);
  assert.ok(!bars.includes('width:100%'), "score bars are scaled to 1.0, not to the largest value");
  assert.equal(isScoreAxis({ key: "score", type: "number", unit: "score" } as any, "score", [0.4, 1.2], false), false, "values above 1 are not a 0–1 score");
});

test("chart with no matching rows says so instead of drawing an empty plot", () => {
  const html = renderToStaticMarkup(<ChartBlock b={{ datasetKey: "egdi", xField: "year", yField: "score", filter: "country=XXX", title: "None" }} dataset={egdi} locale="en" />);
  assert.match(html, /dh-empty/);
  assert.ok(!html.includes("<svg"));
});

test("rowFilter and cellText", () => {
  const f = rowFilter("country=THA;year=2024,2026");
  assert.deepEqual(egdi.rows.filter(f).map((r) => r.year), [2024, 2026]);
  const country = egdi.fields.find((x) => x.key === "country");
  assert.equal(cellText(country, "THA", "en"), "Thailand");
  assert.equal(cellText(country, "THA", "th"), "ไทย");
  assert.equal(cellText(egdi.fields.find((x) => x.key === "score"), 0.7732, "en"), "0.7732");
  assert.equal(cellText(undefined, null, "en"), "–");
});

test("assistant: an LLM answer's [n] citations link to its numbered sources", async () => {
  const { withCitations } = await import("@/components/blocks/AssistantBlock");
  const sources = [{ n: 1, kind: "faq", title: "What is the EGDI?", url: "/x" }, { n: 2, kind: "dataset", title: "EGDI scores", url: "/y" }];
  const html = renderToStaticMarkup(<p>{withCitations("Score 0.7732 [2], defined in [1]; not [7].", sources, "q-src-")}</p>);
  assert.match(html, /<a href="#q-src-2" class="dh-cite" title="EGDI scores">\[2\]<\/a>/);
  assert.match(html, /<a href="#q-src-1" class="dh-cite" title="What is the EGDI\?">\[1\]<\/a>/);
  assert.match(html, /not \[7\]\./, "unknown numbers stay plain text");
});
