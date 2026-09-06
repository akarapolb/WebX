// One-off fix: several ORST pages were migrated into WordPress's own
// `blocks`/`blocks_en` ACF fields (Visual-Builder-authored) while the
// original seed content still had literal `.html`-suffixed hrefs left over
// from the source static site (index.html/contact.html/services.html).
// templates/orst/content/*.json was already corrected for these (see
// public-site's own content JSON), but that fix has no effect on a page
// once it's WP-migrated — `blocks`/`blocks_en` wholesale-overrides the
// static JSON fallback (see app/orst/[page]/page.tsx's own comment). This
// patches the live WordPress-stored blocks string directly instead of
// re-seeding the whole page, so any other Visual-Builder edits made since
// migration are preserved untouched.
//
// Safe to re-run: only rewrites the exact broken substrings; a page with no
// remaining `.html` href is left untouched (reported, not re-written).
//
// Usage: node wordpress/fix-html-links-in-wp-blocks.mjs

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

// TH pages: real anchors point at clean-URL routes rooted at /orst.
const TH_REPLACEMENTS = [
  ['"href":"index.html"', '"href":"/orst"'],
  ['"href":"contact.html"', '"href":"/orst/contact"'],
  ['"href":"services.html"', '"href":"/orst/services"'],
];
// EN pages: same targets, under the /en/orst prefix.
const EN_REPLACEMENTS = [
  ['"href":"index.html"', '"href":"/en/orst"'],
  ['"href":"contact.html"', '"href":"/en/orst/contact"'],
  ['"href":"services.html"', '"href":"/en/orst/services"'],
];

// slug -> id, from a live /wp/v2/pages listing.
const PAGES = {
  "orst-about": 43,
  "orst-dictionary": 132,
  "orst-news": 133,
  "orst-publications": 134,
  "orst-services": 135,
};
// Which of the above also have a blocks_en field to fix.
const EN_PAGES = new Set(["orst-about", "orst-services"]);

function applyFixes(jsonStr, replacements) {
  let text = jsonStr;
  let count = 0;
  for (const [from, to] of replacements) {
    const parts = text.split(from);
    if (parts.length > 1) { count += parts.length - 1; text = parts.join(to); }
  }
  return { text, count };
}

async function fixField(slug, id, field, replacements) {
  const page = await req(`/wp/v2/pages/${id}?_fields=id,slug,acf`);
  const raw = page.acf?.[field] || "";
  if (!raw) { console.log(`${slug} [${field}]: empty, skipping`); return; }
  const { text, count } = applyFixes(raw, replacements);
  if (count === 0) { console.log(`${slug} [${field}]: no broken hrefs found, skipping`); return; }
  await req(`/wp/v2/pages/${id}`, { method: "POST", body: JSON.stringify({ acf: { [field]: text } }) });
  console.log(`${slug} [${field}]: fixed ${count} href(s)`);
}

async function main() {
  for (const [slug, id] of Object.entries(PAGES)) {
    await fixField(slug, id, "blocks", TH_REPLACEMENTS);
    if (EN_PAGES.has(slug)) {
      await fixField(slug, id, "blocks_en", EN_REPLACEMENTS);
    }
  }
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
