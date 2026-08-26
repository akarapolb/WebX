#!/usr/bin/env node
// Thai/government RAG retrieval eval. Zero-dependency (Node 18+).
//   • Always: keyword baseline (Thai-friendly character 3-gram overlap).
//   • When LITELLM_URL is set: semantic retrieval (embeddings + cosine) too.
// Reports recall@k and MRR so you can validate retrieval on Thai content
// BEFORE locking the RAG stack (and use it as a CI quality gate).
//   CMS_ENGINE=strapi|wordpress (default strapi)
//   STRAPI_URL (default http://localhost:1337) · STRAPI_TOKEN — Strapi engine
//   WORDPRESS_URL · WORDPRESS_USERNAME · WORDPRESS_APP_PASSWORD — WordPress engine
//   LITELLM_URL · LITELLM_KEY · LITELLM_EMBED_MODEL
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "../shared/cms-client.mjs";

const ENGINE = process.env.CMS_ENGINE === "wordpress" ? "wordpress" : "strapi";
const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const LITELLM = (process.env.LITELLM_URL || "").replace(/\/$/, "");
const LKEY = process.env.LITELLM_KEY || "";
const EMBED = process.env.LITELLM_EMBED_MODEL || "webx-embed";
const TYPES = ENGINE === "wordpress" ? ["posts"] : ["articles", "services", "faqs"];
const client = ENGINE === "wordpress"
  ? createClient({
      baseUrl: process.env.WORDPRESS_URL || "http://localhost:8081/wp-json",
      token: process.env.WORDPRESS_USERNAME ? process.env.WORDPRESS_USERNAME + ":" + (process.env.WORDPRESS_APP_PASSWORD || "") : "",
      engine: "wordpress",
    })
  : createClient({ baseUrl: STRAPI, token: process.env.STRAPI_TOKEN || "", engine: "strapi" });
const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "dataset.thai.json"), "utf8"));
const K = data.k || 5;

const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const ngrams = (s, n = 3) => { const t = String(s).toLowerCase().replace(/\s+/g, ""); const g = new Set(); for (let i = 0; i + n <= t.length; i++) g.add(t.slice(i, i + n)); return g; };
const jaccard = (a, b) => { let inter = 0; for (const x of a) if (b.has(x)) inter++; return inter / (a.size || 1); };
const cosine = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na) * Math.sqrt(nb) || 1); };

async function corpus() {
  const docs = [];
  for (const type of TYPES) {
    try {
      const { data } = await client.list(type, { pageSize: 100, sort: "updatedAt:desc" });
      for (const e of (data || [])) {
        const title = e.title || e.name || e.question || "";
        const text = (title + " " + stripHtml([e.excerpt, e.body, e.content, e.answer, e.description].filter((x) => typeof x === "string").join(" "))).slice(0, 1200);
        if (text.trim()) docs.push({ source: title || (type + ":" + (e.documentId || e.id)), text });
      }
    } catch {}
  }
  return docs;
}
async function embed(texts) {
  const r = await fetch(LITELLM + "/embeddings", { method: "POST", headers: { "Content-Type": "application/json", ...(LKEY ? { Authorization: "Bearer " + LKEY } : {}) }, body: JSON.stringify({ model: EMBED, input: texts }) });
  if (!r.ok) throw new Error("embed HTTP " + r.status);
  return (await r.json()).data.map((d) => d.embedding);
}
const relevant = (doc, expect) => expect.some((k) => (doc.source + " " + doc.text).toLowerCase().includes(String(k).toLowerCase()));

function score(ranked, expect) {
  const topk = ranked.slice(0, K);
  const hit = topk.some((d) => relevant(d, expect));
  let rr = 0; for (let i = 0; i < topk.length; i++) if (relevant(topk[i], expect)) { rr = 1 / (i + 1); break; }
  const firstSource = topk[0]?.source?.slice(0, 46) || "—";
  return { hit, rr, firstSource };
}

async function run() {
  const docs = await corpus();
  if (!docs.length) { console.error("No corpus — is the " + ENGINE + " engine running and reachable, with content on " + TYPES.join("/") + "?"); process.exit(1); }
  console.log("Corpus: " + docs.length + " docs · k=" + K + " · cases=" + data.cases.length + (LITELLM ? " · semantic ON" : " · keyword-only (set LITELLM_URL for semantic)") + "\n");

  // Pre-embed corpus once for the semantic run
  let dvecs = null;
  if (LITELLM) { try { dvecs = await embed(docs.map((d) => d.text)); } catch (e) { console.error("Semantic disabled: " + e.message + "\n"); } }

  const modes = [{ name: "keyword", on: true }, { name: "semantic", on: Boolean(dvecs) }].filter((m) => m.on);
  const agg = {};
  for (const m of modes) agg[m.name] = { hit: 0, mrr: 0 };

  for (const c of data.cases) {
    const dg = docs.map((d) => ngrams(d.text));
    const ranks = {};
    ranks.keyword = docs.map((d, i) => ({ d, s: jaccard(ngrams(c.q), dg[i]) })).sort((a, b) => b.s - a.s).map((x) => x.d);
    if (dvecs) { const [qv] = await embed([c.q]); ranks.semantic = docs.map((d, i) => ({ d, s: cosine(qv, dvecs[i]) })).sort((a, b) => b.s - a.s).map((x) => x.d); }
    const cells = modes.map((m) => { const r = score(ranks[m.name], c.expect); agg[m.name].hit += r.hit ? 1 : 0; agg[m.name].mrr += r.rr; return m.name[0] + ":" + (r.hit ? "✓" : "✗"); });
    console.log("  " + cells.join("  ").padEnd(20) + " " + c.q.slice(0, 52));
  }

  const n = data.cases.length;
  console.log("\nScorecard (n=" + n + "):");
  for (const m of modes) console.log("  " + m.name.padEnd(9) + " recall@" + K + " = " + (agg[m.name].hit / n * 100).toFixed(0) + "%   MRR = " + (agg[m.name].mrr / n).toFixed(3));
  // CI gate: keyword recall must clear a floor
  const floor = 0.6, kr = agg.keyword.hit / n;
  if (kr < floor) { console.error("\nFAIL: keyword recall " + (kr * 100).toFixed(0) + "% < floor " + floor * 100 + "%"); process.exit(2); }
  console.log("\nPASS");
}
run().catch((e) => { console.error(e.message || e); process.exit(1); });
