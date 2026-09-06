// One-off migration: adds a `source` binding to specific blocks (by id) in
// already-seeded ORST pages, so public-site/lib/blockSource.ts's generic
// resolveSources() can populate their `items` at request time instead of
// app/orst/[page]/page.tsx's old hardcoded per-block-id withItems() calls.
//
// Must run AFTER wordpress/seed-orst-layout.mjs (which creates these pages'
// `blocks` in the first place) — this script only PATCHES a `source` field
// onto blocks that already exist by id; it errors if a page or block id is
// missing rather than silently doing nothing.
//
// Safe to re-run: it always sets `source` to the exact object below,
// overwriting whatever was there — same idempotency note as
// seed-orst-layout.mjs (don't re-run after a real editor has since changed
// these blocks by hand in the Builder, or their edits to `source` itself
// would be reverted).
//
// Usage: node wordpress/seed-orst-sources.mjs

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

// page slug (without the "orst-" prefix) -> { blockId -> source }
const SOURCES = {
  services: {
    "online-services": { kind: "wp", postType: "service", map: "card", icon: "i-form" },
  },
  publications: {
    media: { kind: "wp", postType: "publication", map: "card", icon: "i-video" },
    journals: { kind: "wp", postType: "publication", map: "link", icon: "i-journal" },
  },
  news: {
    highlight: { kind: "wp", postType: "news", map: "card", icon: "i-megaphone", limit: 5, tag: "ข่าวประชาสัมพันธ์" },
    announcements: { kind: "wp", postType: "news", map: "link", icon: "i-file", offset: 5, limit: 5 },
  },
  about: {
    mission: { kind: "wp", postType: "mission", map: "mission" },
    structure: { kind: "wp", postType: "org-unit", map: "orgunit" },
    transparency: { kind: "wp", postType: "document", map: "document" },
  },
  dictionary: {
    services: { kind: "wp", postType: "resource", map: "card", icon: "i-dictionary" },
    faq: { kind: "wp", postType: "faq", map: "faq", limit: 4 },
  },
};

async function main() {
  for (const [name, bindings] of Object.entries(SOURCES)) {
    const slug = "orst-" + name;
    const rows = await req("/wp/v2/pages?slug=" + encodeURIComponent(slug) + "&status=publish,draft,pending,future&per_page=5&context=edit");
    const page = rows[0];
    if (!page) throw new Error("Page not found: " + slug + " (run seed-orst-layout.mjs first)");
    const blocks = JSON.parse(page.acf.blocks || "[]");
    let touched = 0;
    for (const [blockId, source] of Object.entries(bindings)) {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) throw new Error(slug + ": block id \"" + blockId + "\" not found — did seed-orst-layout.mjs run for this page?");
      block.source = source;
      touched++;
    }
    await req("/wp/v2/pages/" + page.id, {
      method: "POST",
      body: JSON.stringify({ acf: { blocks: JSON.stringify(blocks) } }),
    });
    console.log(slug + ": bound " + touched + " block(s) — " + Object.keys(bindings).join(", "));
  }
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
