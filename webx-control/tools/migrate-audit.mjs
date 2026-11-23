#!/usr/bin/env node
// Moves the existing audit rows from Strapi into webx-control (track C3). Safe
// to run again: rows keep their documentId, and ones already imported are skipped.
//
//   STRAPI_URL=http://localhost:1337 STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... \
//   WEBX_CONTROL_URL=http://localhost:1400 WEBX_CONTROL_SERVICE_TOKEN=... \
//     node tools/migrate-audit.mjs [--dry-run]
//
// Reads through Strapi's content-manager as a super admin (the audit log is not
// on the public API), then POSTs batches of 200 to /internal/audit/import. Studio
// switches to the control plane when WEBX_CONTROL_URL and WEBX_CONTROL_SERVICE_TOKEN
// are set; run this first, so the history is there when it does.
const env = (k) => { const v = process.env[k]; if (!v) { console.error(`${k} is required`); process.exit(2); } return v; };
const STRAPI = env("STRAPI_URL").replace(/\/$/, "");
const CONTROL = env("WEBX_CONTROL_URL").replace(/\/$/, "");
const TOKEN = env("WEBX_CONTROL_SERVICE_TOKEN");
const dry = process.argv.includes("--dry-run");
const UID = "api::audit-log.audit-log";
const FIELDS = ["documentId", "action", "contentType", "entryId", "adminEmail", "tenantKey", "at", "actor", "targetRef", "method", "path", "tokens", "createdAt"];

const login = await fetch(`${STRAPI}/admin/login`, {
  method: "POST", headers: { "content-type": "application/json", ...(process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {}) },
  body: JSON.stringify({ email: env("STRAPI_ADMIN_EMAIL"), password: env("STRAPI_ADMIN_PASSWORD") }),
});
const jwt = (await login.json())?.data?.token;
if (!login.ok || !jwt) { console.error(`Strapi login failed (${login.status})`); process.exit(1); }

let page = 1, read = 0, added = 0, skipped = 0;
for (;;) {
  const r = await fetch(`${STRAPI}/content-manager/collection-types/${UID}?page=${page}&pageSize=200&sort=id:asc`, {
    headers: { Authorization: `Bearer ${jwt}`, ...(process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {}) },
  });
  if (!r.ok) { console.error(`reading page ${page}: HTTP ${r.status}`); process.exit(1); }
  const j = await r.json();
  const rows = (j.results ?? j.data ?? []).map((x) => Object.fromEntries(FIELDS.filter((f) => x[f] != null).map((f) => [f, x[f]])));
  read += rows.length;
  if (rows.length && !dry) {
    const w = await fetch(`${CONTROL}/internal/audit/import`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(rows) });
    const res = await w.json().catch(() => null);
    if (!w.ok) { console.error(`import of page ${page} failed: HTTP ${w.status} ${JSON.stringify(res)}`); process.exit(1); }
    added += res.added; skipped += res.skipped;
  }
  const pages = j.pagination?.pageCount ?? 1;
  if (page >= pages || rows.length === 0) break;
  page++;
}
console.log(dry ? `dry run: ${read} row(s) in Strapi, nothing written` : `read ${read} row(s) from Strapi: ${added} added, ${skipped} already there`);
