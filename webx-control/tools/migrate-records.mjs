#!/usr/bin/env node
// Moves page templates, page versions, the agent's threads, reviews and releases from Strapi into
// webx-control (track C3). Safe to run again: rows keep their documentId, and
// ones already imported are skipped.
//
//   STRAPI_URL=http://localhost:1337 STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... \
//   WEBX_CONTROL_URL=http://localhost:1400 WEBX_CONTROL_SERVICE_TOKEN=... \
//     node tools/migrate-records.mjs [--dry-run] [--default-tenant <key>]
//
// Run it before switching Studio over (WEBX_CONTROL_URL + WEBX_CONTROL_SERVICE_TOKEN),
// so the templates (and threads, reviews, releases) are there when it does. Reads through Strapi's
// content-manager as a super admin.
//
// Reviews and releases carry a `tenant` relation in Strapi, where the control plane keeps the workspace's key (`tenantKey`).
// The key of each row is found by asking Strapi for the rows of each workspace (the keys come from /api/tenants/keys). A row
// that no workspace's filter reaches (one made before rows were stamped with their workspace) is reported and left in Strapi;
// --default-tenant files such rows under that workspace instead.
//
// Exit code: 0 done, 1 something failed (what is said on stderr), 2 a setting is missing.

const TYPES = {
  "api::page-template.page-template": "page-template",
  "api::page-version.page-version": "page-version",
  "api::agent-thread.agent-thread": "agent-thread",
  "api::review.review": "review",
  "api::release.release": "release",
};
// the types whose rows name their workspace by a relation in Strapi, by a key here
const BY_TENANT = new Set(["api::review.review", "api::release.release"]);
// Strapi's own bookkeeping, not part of the record
const DROP = new Set(["id", "createdBy", "updatedBy", "publishedAt", "locale", "localizations", "status"]);
// a release's publishedAt is when it was published: a field of the record, not Strapi's
const KEEP = { "api::release.release": ["publishedAt"] };
const PAGE = 200;

async function main() {
  const need = (k) => { const v = process.env[k]; if (!v) { console.error(`${k} is required`); throw Object.assign(new Error(), { exit: 2 }); } return v; };
  const STRAPI = need("STRAPI_URL").replace(/\/$/, "");
  const CONTROL = need("WEBX_CONTROL_URL").replace(/\/$/, "");
  const TOKEN = need("WEBX_CONTROL_SERVICE_TOKEN");
  const EMAIL = need("STRAPI_ADMIN_EMAIL"), PASSWORD = need("STRAPI_ADMIN_PASSWORD");
  const dry = process.argv.includes("--dry-run");
  const dt = process.argv.indexOf("--default-tenant");
  const DEFAULT_TENANT = dt > 0 ? process.argv[dt + 1] : "";
  const SECRET = process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {};
  // connections are not kept alive: the tool ends as soon as it is done
  const plain = (url, init = {}) => fetch(url, { ...init, headers: { connection: "close", ...(init.headers || {}) } });

  const login = await plain(`${STRAPI}/admin/login`, { method: "POST", headers: { "content-type": "application/json", ...SECRET }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const jwt = (await login.json().catch(() => null))?.data?.token;
  if (!login.ok || !jwt) { console.error(`Strapi login failed (${login.status})`); return 1; }

  let keys = [];
  if ([...BY_TENANT].some((u) => u in TYPES)) {
    keys = (await (await plain(`${STRAPI}/api/tenants/keys`)).json().catch(() => null))?.data?.map((t) => t.key) ?? [];
    if (!keys.length) { console.error("Strapi lists no tenants"); return 1; }
  }

  /** a page of rows at a time, of a content type, optionally only one workspace's */
  async function* pagesOf(uid, tenant) {
    for (let page = 1; ; page++) {
      const filter = tenant ? `&filters[tenant][key][$eq]=${encodeURIComponent(tenant)}` : "";
      const r = await plain(`${STRAPI}/content-manager/collection-types/${uid}?page=${page}&pageSize=${PAGE}&sort=id:asc${filter}`, { headers: { Authorization: `Bearer ${jwt}`, ...SECRET } });
      if (!r.ok) throw new Error(`reading page ${page}${tenant ? ` of ${tenant}` : ""}: HTTP ${r.status}`);
      const j = await r.json();
      const rows = j.results ?? j.data ?? [];
      if (rows.length) yield rows;
      if (page >= (j.pagination?.pageCount ?? 1) || rows.length === 0) return;
    }
  }

  let failed = false;
  for (const [uid, collection] of Object.entries(TYPES)) {
    const byTenant = BY_TENANT.has(uid);
    const keep = KEEP[uid] || [];
    const clean = (row, tenant) => {
      const doc = Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== undefined && (!DROP.has(k) || keep.includes(k)) && !(byTenant && k === "tenant")));
      if (tenant) doc.tenantKey = tenant;
      return doc;
    };
    let read = 0, added = 0, skipped = 0, unassigned = 0;
    const seen = new Set();
    const send = async (docs) => {
      read += docs.length;
      if (!docs.length || dry) return;
      const w = await plain(`${CONTROL}/internal/records/${collection}/import`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(docs) });
      const res = await w.json().catch(() => null);
      if (!w.ok) throw new Error(`import failed: HTTP ${w.status} ${JSON.stringify(res)}`);
      added += res.added; skipped += res.skipped;
    };
    try {
      if (byTenant) {
        for (const key of keys) {
          for await (const rows of pagesOf(uid, key)) {
            const fresh = rows.filter((r) => !seen.has(r.documentId));
            fresh.forEach((r) => seen.add(r.documentId));
            await send(fresh.map((r) => clean(r, key)));
          }
        }
        // rows no workspace's filter reached: reported, and filed under --default-tenant when one is given
        for await (const rows of pagesOf(uid)) {
          const rest = rows.filter((r) => !seen.has(r.documentId));
          rest.forEach((r) => seen.add(r.documentId));
          unassigned += rest.length;
          if (DEFAULT_TENANT) await send(rest.map((r) => clean(r, DEFAULT_TENANT)));
        }
      } else {
        for await (const rows of pagesOf(uid)) await send(rows.map((r) => clean(r)));
      }
    } catch (e) {
      console.error(`${collection}: ${e.message}`);
      failed = true;
      continue;
    }
    const tail = !unassigned ? "" : DEFAULT_TENANT ? `; ${unassigned} row(s) had no tenant (filed under ${DEFAULT_TENANT})` : `; ${unassigned} row(s) had no tenant and were left`;
    console.log(dry ? `${collection}: ${read} row(s) in Strapi, nothing written${tail}` : `${collection}: read ${read}: ${added} added, ${skipped} already there${tail}`);
  }
  return failed ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (e) => {
  if (e?.exit) { process.exitCode = e.exit; return; }
  console.error(e?.message || e);
  process.exitCode = 1;
});
