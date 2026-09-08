// One-off migration: creates the `wtenant` taxonomy terms for ORST and
// RoyalSociety. Every other wordpress/seed-*.mjs script (and this app's
// own tenant-scoping mechanism — see wordpress/mu-plugins/
// wtenant-taxonomy.php) requires these terms to already exist, but nothing
// created them on a fresh WordPress install: the only other place that
// creates a wtenant term is webx-studio's own tenant-creation flow
// (governance.ts's ensureWordpressTenantTerm(), called from create() when
// a brand-new tenant is made through the admin UI) — no help when ORST/
// RoyalSociety already exist as Strapi tenant records (see
// strapi-cms/src/seed/seed.ts's seedOrstRoyalSocietyTenants, which runs
// automatically on every Strapi boot) but were never created THROUGH that
// UI flow on a fresh environment.
//
// Run this FIRST, before any other wordpress/seed-*.mjs script — they all
// assume these terms already exist and fail loudly (`No wtenant term
// found for "..."`) if not.
//
// Safe to re-run: no-ops on a term that already exists.
//
// Usage: node wordpress/seed-tenants.mjs

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

// name === slug here — WordPress's own display name for the term doesn't
// matter anywhere in this app (only the slug is ever read, via
// wtenant.slug lookups), same convention every other seed script already
// assumes.
const TENANTS = [
  { key: "orst" },
  { key: "royalsociety" },
];

async function main() {
  const existing = await req("/wp/v2/wtenant?per_page=100");
  for (const t of TENANTS) {
    const found = existing.find((x) => x.slug === t.key);
    if (found) {
      console.log(t.key + ": wtenant term already exists (id " + found.id + ")");
      continue;
    }
    const created = await req("/wp/v2/wtenant", { method: "POST", body: JSON.stringify({ name: t.key, slug: t.key }) });
    console.log(t.key + ": created wtenant term (id " + created.id + ")");
  }
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
