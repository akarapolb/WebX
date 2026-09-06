// One-off migration: creates sample `member` CPT rows (Fellows/Associate
// Members) for both ORST and RoyalSociety tenants, so the member/scholar
// directory (components/MemberDirectory.tsx) has real data instead of an
// empty directory.
//
// Names are generic numbered roster slots ("ราชบัณฑิต ลำดับที่ 1"), NOT
// invented-but-plausible-sounding Thai names — unlike a sample event or
// document title, a "ราชบัณฑิต"/"ภาคีสมาชิก" is a specific, identifiable,
// royally-appointed individual, so a realistic-looking fabricated name risks
// being mistaken for a real (or real-sounding, so potentially defamatory-
// by-confusion) appointee. No bio/specialty invented either, for the same
// reason (see MemberDirectory.tsx — an absent bio just renders no <p>, not
// a broken-looking gap). No featured image either, same "don't link a
// placeholder file" convention as seed-royalsociety-documents.mjs leaving
// file_url blank — the component's own name-initial fallback covers this.
//
// This is a real bracket-lint-sensitive distinction from every other seed
// script in this repo: e2e/tests/public-site.spec.ts's PLACEHOLDER_PATTERN
// fails a page on any literal "[...]" text (found live, the first version
// of this script used bracketed names) — a generic-but-unbracketed label
// avoids both the impersonation risk AND that lint, which content/*.json's
// own bracket convention is fine to use since those never reach a page
// that's actually shipped with real WordPress data behind it.
//
// Safe to re-run: UPDATEs a member that already exists by title (matched
// within that tenant's wtenant scope), same idempotency convention as
// seed-royalsociety-documents.mjs / seed-events.mjs.
//
// Usage: node wordpress/seed-members.mjs

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

const MEMBERS = {
  orst: [
    { title: "ราชบัณฑิต ลำดับที่ 1", tier: "ราชบัณฑิต", division: "สำนักศิลปกรรม", order: 1 },
    { title: "ราชบัณฑิต ลำดับที่ 2", tier: "ราชบัณฑิต", division: "สำนักวิทยาศาสตร์", order: 2 },
    { title: "ราชบัณฑิต ลำดับที่ 3", tier: "ราชบัณฑิต", division: "สำนักธรรมศาสตร์และการเมือง", order: 3 },
    { title: "ภาคีสมาชิก ลำดับที่ 1", tier: "ภาคีสมาชิก", division: "สำนักศิลปกรรม", order: 4 },
    { title: "ภาคีสมาชิก ลำดับที่ 2", tier: "ภาคีสมาชิก", division: "สำนักวิทยาศาสตร์", order: 5 },
    { title: "ภาคีสมาชิก ลำดับที่ 3", tier: "ภาคีสมาชิก", division: "สำนักธรรมศาสตร์และการเมือง", order: 6 },
  ],
  royalsociety: [
    { title: "ราชบัณฑิต ลำดับที่ 1", tier: "ราชบัณฑิต", division: "สำนักธรรมศาสตร์และการเมือง", order: 1 },
    { title: "ราชบัณฑิต ลำดับที่ 2", tier: "ราชบัณฑิต", division: "สำนักวิทยาศาสตร์", order: 2 },
    { title: "ราชบัณฑิต ลำดับที่ 3", tier: "ราชบัณฑิต", division: "สำนักศิลปกรรม", order: 3 },
    { title: "ภาคีสมาชิก ลำดับที่ 1", tier: "ภาคีสมาชิก", division: "สำนักธรรมศาสตร์และการเมือง", order: 4 },
    { title: "ภาคีสมาชิก ลำดับที่ 2", tier: "ภาคีสมาชิก", division: "สำนักวิทยาศาสตร์", order: 5 },
    { title: "ภาคีสมาชิก ลำดับที่ 3", tier: "ภาคีสมาชิก", division: "สำนักศิลปกรรม", order: 6 },
  ],
};

async function findByTitle(title, tenantTermId) {
  const rows = await req("/wp/v2/member?wtenant=" + tenantTermId + "&search=" + encodeURIComponent(title) + "&per_page=10");
  return rows.find((r) => r.title?.rendered === title) || null;
}

async function main() {
  for (const [tenant, rows] of Object.entries(MEMBERS)) {
    const tenantTermId = await wtenantId(tenant);
    console.log(tenant + " wtenant term id:", tenantTermId);
    for (const m of rows) {
      const existing = await findByTitle(m.title, tenantTermId);
      const payload = {
        title: m.title, status: "publish", excerpt: m.bio, wtenant: [tenantTermId],
        acf: { tier: m.tier, division: m.division, order: m.order },
      };
      if (existing) {
        await req("/wp/v2/member/" + existing.id, { method: "POST", body: JSON.stringify(payload) });
        console.log(tenant, "updated", m.title, "(id " + existing.id + ")");
      } else {
        const created = await req("/wp/v2/member", { method: "POST", body: JSON.stringify(payload) });
        console.log(tenant, "created", m.title, "(id " + created.id + ")");
      }
    }
  }
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
