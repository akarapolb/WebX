// One-off migration: bilingual EN (TOR gap) — imports templates/{tenant}/
// content/en/*.json's static block arrays into WordPress as each page's
// `blocks_en` ACF field (see mu-plugins/acf-fields.php's group_page_layout),
// the English counterpart of seed-orst-layout.mjs / seed-royalsociety-
// layout.mjs's own `blocks` field. The public-site's /en/ routes prefer this
// live WP field over the static JSON — see app/en/{orst,royalsociety}/
// page.tsx's own comments — so editing the content/en/*.json files alone has
// no effect on an already-migrated page; re-run this after changing them.
//
// Only orst/royalsociety's home/about/contact/services pages have an
// English translation today — every other page (dictionary/news/
// publications/knowledge/activities) is intentionally left untouched here.
//
// Safe to re-run: always sets these exact block arrays, overwriting
// whatever's in blocks_en — same idempotency note as seed-orst-layout.mjs.
// Never touches the Thai `blocks` field.
//
// Usage: node wordpress/seed-en-content-blocks.mjs

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

async function findPageBySlug(slug) {
  const rows = await req("/wp/v2/pages?slug=" + encodeURIComponent(slug) + "&status=publish,draft,pending,future&per_page=5");
  return rows[0] || null;
}

// Bilingual pages only (see this file's own header comment for why the rest
// of each tenant's page set is out of scope for this migration).
const TENANT_PAGES = {
  orst: ["home", "about", "contact", "services"],
  royalsociety: ["home", "about", "contact", "services"],
};

async function main() {
  for (const [tenant, pages] of Object.entries(TENANT_PAGES)) {
    const contentDir = path.join(repoRoot, "public-site", "templates", tenant, "content", "en");
    for (const name of pages) {
      const jsonPath = path.join(contentDir, name + ".json");
      const data = JSON.parse(readFileSync(jsonPath, "utf8"));
      const slug = tenant + "-" + name;
      const blocksJson = JSON.stringify(data.blocks || []);

      const existing = await findPageBySlug(slug);
      if (!existing) {
        console.warn("skip " + slug + ": page not found (run seed-" + tenant + "-layout.mjs first)");
        continue;
      }
      await req("/wp/v2/pages/" + existing.id, {
        method: "POST",
        body: JSON.stringify({ acf: { blocks_en: blocksJson } }),
      });
      console.log("updated", slug, "(id " + existing.id + "),", (data.blocks || []).length, "English blocks");
    }
  }
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
