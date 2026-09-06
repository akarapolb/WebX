// One-off migration: import templates/orst/content/*.json's static block
// arrays into WordPress as each page's `blocks` ACF field (see mu-plugins/
// acf-fields.php's group_page_layout), so WordPress becomes the single
// source of truth for ORST page layout instead of the repo JSON files.
//
// Not idempotent-safe-to-loop like strapi-cms's seed.ts — this is a one-time
// migration, run by hand once per environment. Safe to re-run: it always
// UPDATEs a page that already exists by slug rather than blindly creating,
// so re-running just re-imports the same content (harmless unless someone
// has since hand-edited the page's blocks in the Builder, in which case this
// would overwrite that — don't re-run after real edits have happened).
//
// Usage: node wordpress/seed-orst-layout.mjs
// Reads WORDPRESS_URL / WORDPRESS_SCHEDULER_USERNAME /
// WORDPRESS_SCHEDULER_APP_PASSWORD from webx-studio/.env.local (same
// credentials wordpress.ts's adapter uses), or from the environment if set.

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

const ALL_PAGES = ["about", "dictionary", "news", "publications", "services", "contact", "knowledge", "home"];
// Optional: node wordpress/seed-orst-layout.mjs contact — seeds only the
// named page(s). Re-running for a page already migrated by
// seed-orst-sources.mjs would overwrite its `source` bindings with the
// original static JSON's plain (unbound) blocks, so a full re-run is only
// safe for a fresh environment, never to add one new page to an
// already-customized one — use this filter for that case instead.
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ALL_PAGES;
const CONTENT_DIR = path.join(repoRoot, "public-site", "templates", "orst", "content");

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
  const orstTermId = await wtenantId("orst");
  console.log("orst wtenant term id:", orstTermId);

  for (const name of PAGES) {
    const jsonPath = path.join(CONTENT_DIR, name + ".json");
    const data = JSON.parse(readFileSync(jsonPath, "utf8"));
    const slug = "orst-" + name;
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
          status: "publish", wtenant: [orstTermId],
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
