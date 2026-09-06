// One-off migration: import templates/royalsociety/content/*.json's static
// block arrays into WordPress as each page's `blocks` ACF field — the
// RoyalSociety sibling of seed-orst-layout.mjs (same mechanism, same
// mu-plugins/acf-fields.php field, same reasoning; see that file's own
// header comment for the full rationale).
//
// royalsociety-home and royalsociety-about already exist as WordPress pages
// (AboutPage.tsx/HomePage.tsx read them for narrative content before this
// migration) — this UPDATEs those two rather than creating duplicates, and
// creates the remaining 5 pages fresh. Safe to re-run for the same reason
// seed-orst-layout.mjs is: it always UPDATEs a page that already exists by
// slug, so re-running just re-imports the same content (harmless unless
// someone has since hand-edited a page's blocks in the Builder).
//
// Usage: node wordpress/seed-royalsociety-layout.mjs
// Reads WORDPRESS_URL / WORDPRESS_SCHEDULER_USERNAME /
// WORDPRESS_SCHEDULER_APP_PASSWORD from webx-studio/.env.local, or from the
// environment if set.

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

const ALL_PAGES = ["home", "about", "knowledge", "activities", "publications", "services", "contact"];
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ALL_PAGES;
const CONTENT_DIR = path.join(repoRoot, "public-site", "templates", "royalsociety", "content");

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

async function findPageBySlug(slug) {
  const rows = await req("/wp/v2/pages?slug=" + encodeURIComponent(slug) + "&status=publish,draft,pending,future&per_page=5");
  return rows[0] || null;
}

async function main() {
  const tenantTermId = await wtenantId("royalsociety");
  console.log("royalsociety wtenant term id:", tenantTermId);

  for (const name of PAGES) {
    const jsonPath = path.join(CONTENT_DIR, name + ".json");
    const data = JSON.parse(readFileSync(jsonPath, "utf8"));
    const slug = "royalsociety-" + name;
    const blocksJson = JSON.stringify(data.blocks || []);

    const existing = await findPageBySlug(slug);
    if (existing) {
      await req("/wp/v2/pages/" + existing.id, {
        method: "POST",
        body: JSON.stringify({ acf: { blocks: blocksJson } }),
      });
      console.log("updated", slug, "(id " + existing.id + "),", (data.blocks || []).length, "blocks");
    } else {
      const created = await req("/wp/v2/pages", {
        method: "POST",
        body: JSON.stringify({
          slug, title: data.title || name, excerpt: data.description || "",
          status: "publish", wtenant: [tenantTermId],
          acf: { blocks: blocksJson },
        }),
      });
      if (created.slug !== slug) throw new Error("WordPress renamed the slug to " + created.slug + " — a page with slug " + slug + " may already exist under a different status. Aborting to avoid an orphaned duplicate.");
      console.log("created", slug, "(id " + created.id + "),", (data.blocks || []).length, "blocks");
    }
  }
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
