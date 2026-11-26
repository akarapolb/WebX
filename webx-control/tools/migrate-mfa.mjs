#!/usr/bin/env node
// Copies Strapi's MFA enrolments (api::mfa-enrollment, the second factor Studio checks today) into webx-control (track C4, step 4,
// decision D20): each person's authenticator secret, so the app on their phone goes on working, and the hashes of the recovery codes
// they have not used yet, each of which control accepts once. Copy, not move: Strapi's rows are not touched, and Studio keeps using
// them until a workspace signs in through webx-control.
//
//   STRAPI_URL=http://localhost:1337 STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... \
//   WEBX_CONTROL_URL=http://localhost:1400 WEBX_CONTROL_ADMIN_TOKEN=... \
//     node tools/migrate-mfa.mjs [--dry-run] [--replace]
//
// Only finished enrolments are copied (one Strapi holds as not enabled was never confirmed). A person who is not in webx-control yet
// is reported: run tools/migrate-users.mjs first. A person whose second factor webx-control already knows anything about is left alone:
// one set up there since, a set-up started there, or one taken away there (a lost phone) or switched off, which a copy must never bring
// back. --replace overwrites it. webx-control needs WEBX_CONTROL_SECRET_KEY: it seals each secret under it.
//
// Exit code: 0 done, 1 something failed or someone could not be copied (said on stderr), 2 a setting is missing.

/** A reason to stop, said on stderr with an exit code (process.exit is not used: on Windows it can abort while connections close). */
class Stop extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

async function main() {
  const need = (k) => { const v = process.env[k]; if (!v) throw new Stop(`${k} is required`, 2); return v; };
  const STRAPI = need("STRAPI_URL").replace(/\/$/, "");
  const CONTROL = need("WEBX_CONTROL_URL").replace(/\/$/, "");
  const ADMIN = need("WEBX_CONTROL_ADMIN_TOKEN");
  const dry = process.argv.includes("--dry-run");
  const replace = process.argv.includes("--replace");
  const SECRET = process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {};

  const login = await fetch(`${STRAPI}/admin/login`, { method: "POST", headers: { "content-type": "application/json", ...SECRET }, body: JSON.stringify({ email: need("STRAPI_ADMIN_EMAIL"), password: need("STRAPI_ADMIN_PASSWORD") }) });
  const jwt = (await login.json().catch(() => null))?.data?.token;
  if (!login.ok || !jwt) throw new Stop(`Strapi login failed (${login.status})`);
  const H = { Authorization: `Bearer ${jwt}`, ...SECRET };

  const rows = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${STRAPI}/content-manager/collection-types/api::mfa-enrollment.mfa-enrollment?page=${page}&pageSize=100`, { headers: H });
    if (!r.ok) throw new Stop(`Strapi mfa-enrollment page ${page}: HTTP ${r.status}`);
    const j = await r.json();
    const got = j.results ?? j.data ?? [];
    rows.push(...got);
    if (page >= (j.pagination?.pageCount ?? 1) || got.length === 0) break;
  }

  let copied = 0, kept = 0, unfinished = 0;
  const missing = [], failed = [];
  for (const row of rows) {
    const email = String(row.adminEmail || "").trim().toLowerCase();
    if (!email) { failed.push("a row with no adminEmail"); continue; }
    if (!row.enabled || !row.secret) { unfinished++; console.log(`skip ${email}: the enrolment was never confirmed`); continue; }
    const used = new Set((Array.isArray(row.recoveryCodesUsed) ? row.recoveryCodesUsed : []).map((h) => String(h).toLowerCase()));
    const unused = (Array.isArray(row.recoveryCodesHash) ? row.recoveryCodesHash : []).map((h) => String(h).toLowerCase()).filter((h) => !used.has(h));
    if (dry) {
      console.log(`would copy ${email}: authenticator, ${unused.length} unused recovery code(s)`);
      continue;
    }
    const r = await fetch(`${CONTROL}/admin/users/${encodeURIComponent(email)}/mfa`, { method: "PUT", headers: { Authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body: JSON.stringify({ secret: row.secret, legacyRecoveryHashes: unused, replace }) });
    if (r.status === 404) { missing.push(email); continue; }
    const j = await r.json().catch(() => null);
    if (!r.ok) { failed.push(`${email}: HTTP ${r.status} ${j?.error?.message ?? ""}`); continue; }
    if (j?.data?.imported) { copied++; console.log(`copied ${email}: authenticator, ${unused.length} unused recovery code(s)`); }
    else { kept++; console.log(`kept ${email}: webx-control already has this person's second factor, or its history (one taken away or switched off stays so); --replace overwrites it`); }
  }
  console.log(dry ? `dry run: ${rows.length} enrolment(s) read from Strapi, nothing written` : `${copied} copied, ${kept} left as they were, ${unfinished} never confirmed`);
  for (const m of missing) console.error(`not in webx-control: ${m} (run tools/migrate-users.mjs first)`);
  for (const f of failed) console.error(`failed: ${f}`);
  if (missing.length || failed.length) throw new Stop(`${missing.length + failed.length} enrolment(s) not copied`);
}

main().then(
  () => { process.exitCode = 0; },
  (e) => {
    console.error(e instanceof Stop ? e.message : e);
    process.exitCode = e instanceof Stop ? e.code : 1;
  },
);
