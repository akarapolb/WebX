#!/usr/bin/env node
// Moves page templates, page versions and the agent's threads from Strapi into
// webx-control (track C3). Safe to run again: rows keep their documentId, and
// ones already imported are skipped.
//
//   STRAPI_URL=http://localhost:1337 STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... \
//   WEBX_CONTROL_URL=http://localhost:1400 WEBX_CONTROL_SERVICE_TOKEN=... \
//     node tools/migrate-records.mjs [--dry-run]
//
// Run it before switching Studio over (WEBX_CONTROL_URL + WEBX_CONTROL_SERVICE_TOKEN),
// so the templates (and threads) are there when it does. Reads through Strapi's
// content-manager as a super admin.
const env = (k) => { const v = process.env[k]; if (!v) { console.error(`${k} is required`); process.exit(2); } return v; };
const STRAPI = env("STRAPI_URL").replace(/\/$/, "");
const CONTROL = env("WEBX_CONTROL_URL").replace(/\/$/, "");
const TOKEN = env("WEBX_CONTROL_SERVICE_TOKEN");
const dry = process.argv.includes("--dry-run");
const SECRET = process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {};
const TYPES = { "api::page-template.page-template": "page-template", "api::page-version.page-version": "page-version", "api::agent-thread.agent-thread": "agent-thread" };
// Strapi's own bookkeeping, not part of the record
const DROP = new Set(["id", "createdBy", "updatedBy", "publishedAt", "locale", "localizations", "status"]);

const login = await fetch(`${STRAPI}/admin/login`, {
  method: "POST", headers: { "content-type": "application/json", ...SECRET },
  body: JSON.stringify({ email: env("STRAPI_ADMIN_EMAIL"), password: env("STRAPI_ADMIN_PASSWORD") }),
});
const jwt = (await login.json())?.data?.token;
if (!login.ok || !jwt) { console.error(`Strapi login failed (${login.status})`); process.exit(1); }

for (const [uid, collection] of Object.entries(TYPES)) {
  let page = 1, read = 0, added = 0, skipped = 0;
  for (;;) {
    const r = await fetch(`${STRAPI}/content-manager/collection-types/${uid}?page=${page}&pageSize=200&sort=id:asc`, { headers: { Authorization: `Bearer ${jwt}`, ...SECRET } });
    if (!r.ok) { console.error(`${collection}: reading page ${page}: HTTP ${r.status}`); process.exit(1); }
    const j = await r.json();
    const rows = (j.results ?? j.data ?? []).map((x) => Object.fromEntries(Object.entries(x).filter(([k, v]) => !DROP.has(k) && v !== undefined)));
    read += rows.length;
    if (rows.length && !dry) {
      const w = await fetch(`${CONTROL}/internal/records/${collection}/import`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(rows) });
      const res = await w.json().catch(() => null);
      if (!w.ok) { console.error(`${collection}: import of page ${page} failed: HTTP ${w.status} ${JSON.stringify(res)}`); process.exit(1); }
      added += res.added; skipped += res.skipped;
    }
    if (page >= (j.pagination?.pageCount ?? 1) || rows.length === 0) break;
    page++;
  }
  console.log(dry ? `${collection}: ${read} row(s) in Strapi, nothing written` : `${collection}: read ${read}: ${added} added, ${skipped} already there`);
}
