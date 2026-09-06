// One-off migration: creates RoyalSociety's `document` CPT rows (the ITA
// transparency-disclosure documents), which the new "transparency" block
// added to templates/royalsociety/content/about.json binds to via
// `source: {kind:"wp", postType:"document", map:"document"}` — same
// mechanism ORST's own about page's "transparency" block already uses.
// RoyalSociety had zero `document` rows before this script; ORST's own
// document content is itself placeholder-quality (fiscal_year/file_url left
// blank, "[ปีงบประมาณ]" bracket placeholders) — these mirror that same
// bar, not real ITA filings.
//
// Safe to re-run: it always UPDATEs a document that already exists by title
// (matched within the royalsociety wtenant scope) rather than creating a
// duplicate, same idempotency convention as seed-royalsociety-layout.mjs.
//
// Usage: node wordpress/seed-royalsociety-documents.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(repoRoot, "webx-studio", ".env.local");
  const out = {};
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {}
  return out;
}

const envFile = loadEnvLocal();
const WORDPRESS_URL = (process.env.WORDPRESS_URL || envFile.WORDPRESS_URL || "http://localhost:8081/wp-json").replace(/\/$/, "");
const WP_USER = process.env.WORDPRESS_SCHEDULER_USERNAME || envFile.WORDPRESS_SCHEDULER_USERNAME;
const WP_PASS = process.env.WORDPRESS_SCHEDULER_APP_PASSWORD || envFile.WORDPRESS_SCHEDULER_APP_PASSWORD;
if (!WP_USER || !WP_PASS) {
  console.error("Missing WORDPRESS_SCHEDULER_USERNAME / WORDPRESS_SCHEDULER_APP_PASSWORD (checked env and webx-studio/.env.local)");
  process.exit(1);
}
const AUTH = "Basic " + Buffer.from(WP_USER + ":" + WP_PASS).toString("base64");

async function req(reqPath, opts = {}) {
  const r = await fetch(WORDPRESS_URL + reqPath, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: AUTH, ...(opts.headers || {}) },
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) throw new Error(reqPath + " -> " + r.status + ": " + (body.message || text).slice(0, 300));
  return body;
}

async function wtenantId(key) {
  const terms = await req("/wp/v2/wtenant?per_page=100");
  const t = terms.find((x) => x.slug === key);
  if (!t) throw new Error('No wtenant term found for "' + key + '"');
  return t.id;
}

// Mirrors ORST's own about-page "transparency" block content (same 4-item
// ITA disclosure set), adapted only in wording where ORST's phrasing was
// agency-specific.
const DOCUMENTS = [
  { title: "แผนปฏิบัติราชการประจำปี", tag: "PDF", order: 1 },
  { title: "รายงานผลการดำเนินงานประจำปี", tag: "PDF", order: 2 },
  { title: "แผนการใช้จ่ายงบประมาณ", tag: "PDF", order: 3 },
  { title: "นโยบายคุ้มครองข้อมูลส่วนบุคคล", tag: "PDF", order: 4 },
];

async function findByTitle(title, tenantTermId) {
  const rows = await req("/wp/v2/document?wtenant=" + tenantTermId + "&search=" + encodeURIComponent(title) + "&per_page=10");
  return rows.find((r) => r.title?.rendered === title) || null;
}

async function main() {
  const tenantTermId = await wtenantId("royalsociety");
  console.log("royalsociety wtenant term id:", tenantTermId);

  for (const doc of DOCUMENTS) {
    const existing = await findByTitle(doc.title, tenantTermId);
    const payload = {
      title: doc.title, status: "publish", wtenant: [tenantTermId],
      acf: { tag: doc.tag, fiscal_year: "", file_url: "", order: doc.order },
    };
    if (existing) {
      await req("/wp/v2/document/" + existing.id, { method: "POST", body: JSON.stringify(payload) });
      console.log("updated", doc.title, "(id " + existing.id + ")");
    } else {
      const created = await req("/wp/v2/document", { method: "POST", body: JSON.stringify(payload) });
      console.log("created", doc.title, "(id " + created.id + ")");
    }
  }
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
