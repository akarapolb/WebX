#!/usr/bin/env node
// Moves the form submissions (complaints, applications, registrations, contact messages) and the files attached to them from
// Strapi into webx-control (track C5). Optional: Studio and Strapi's dashboards already read both places, so nothing has to
// be moved for the public site to be switched. Move them when Strapi's copy is to be retired (track C6).
//
//   STRAPI_URL=http://localhost:1337 STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... \
//   WEBX_CONTROL_URL=http://localhost:1400 WEBX_CONTROL_SERVICE_TOKEN=... \
//     node tools/migrate-forms.mjs [--dry-run] [--move] [--default-tenant <key>]
//
// webx-control must be running with WEBX_PII_KEY set. Rows keep their documentId, reference number, stage, steps and times,
// and a row already in the control plane is skipped, so it is safe to run again. The workspace of each row is read by asking
// Strapi for the rows of each tenant (a row with no tenant is reported, and given --default-tenant if that is set). Strapi
// returns the personal data decrypted; webx-control encrypts it again (a value that is already ciphertext under its key is kept).
// Files are downloaded from Strapi's uploads and stored by webx-control, encrypted.
//
//   --dry-run   read and report, write nothing
//   --move      after a row is safely in the control plane, delete it from Strapi (and, with it, its file reference).
//               Without this, Strapi's rows stay and a list that reads both places shows a migrated row twice until they are deleted.
//
// Exit code: 0 done, 1 something failed (what is said on stderr), 2 a setting is missing or the flags do not fit.

const TYPES = {
  "api::complaint.complaint": { collection: "complaint", file: "attachment" },
  "api::application.application": { collection: "application", file: "resume" },
  "api::registration.registration": { collection: "registration" },
  "api::contact-message.contact-message": { collection: "contact-message" },
};
// Strapi's own bookkeeping, not part of the record (the workspace becomes tenantKey)
const DROP = new Set(["id", "createdBy", "updatedBy", "publishedAt", "locale", "localizations", "status", "tenant"]);

async function main() {
  const need = (k) => { const v = process.env[k]; if (!v) { console.error(`${k} is required`); throw Object.assign(new Error(), { exit: 2 }); } return v; };
  const STRAPI = need("STRAPI_URL").replace(/\/$/, "");
  const CONTROL = need("WEBX_CONTROL_URL").replace(/\/$/, "");
  const TOKEN = need("WEBX_CONTROL_SERVICE_TOKEN");
  const EMAIL = need("STRAPI_ADMIN_EMAIL"), PASSWORD = need("STRAPI_ADMIN_PASSWORD");
  const dry = process.argv.includes("--dry-run");
  const move = process.argv.includes("--move");
  const dt = process.argv.indexOf("--default-tenant");
  const DEFAULT_TENANT = dt > 0 ? process.argv[dt + 1] : "";
  if (dry && move) { console.error("--dry-run and --move together would do nothing"); return 2; }
  const SECRET = process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {};
  // connections are not kept alive: the tool ends as soon as it is done
  const plain = (url, init = {}) => fetch(url, { ...init, headers: { connection: "close", ...(init.headers || {}) } });

  const login = await plain(`${STRAPI}/admin/login`, { method: "POST", headers: { "content-type": "application/json", ...SECRET }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const jwt = (await login.json().catch(() => null))?.data?.token;
  if (!login.ok || !jwt) { console.error(`Strapi login failed (${login.status})`); return 1; }
  const strapi = (path, init = {}) => plain(`${STRAPI}${path}`, { ...init, headers: { Authorization: `Bearer ${jwt}`, ...SECRET, ...(init.headers || {}) } });
  const control = (path, init = {}) => plain(`${CONTROL}/internal${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) } });

  const keys = (await (await plain(`${STRAPI}/api/tenants/keys`)).json().catch(() => null))?.data?.map((t) => t.key) ?? [];
  if (!keys.length) { console.error("Strapi lists no tenants"); return 1; }

  /** every row of a content type, optionally only one tenant's, a page at a time */
  async function* rowsOf(uid, tenant) {
    for (let page = 1; ; page++) {
      const filter = tenant ? `&filters[tenant][key][$eq]=${encodeURIComponent(tenant)}` : "";
      const r = await strapi(`/content-manager/collection-types/${uid}?page=${page}&pageSize=100&sort=id:asc${filter}`);
      if (!r.ok) throw new Error(`reading page ${page}: HTTP ${r.status}`);
      const j = await r.json();
      const rows = j.results ?? j.data ?? [];
      yield* rows;
      if (page >= (j.pagination?.pageCount ?? 1) || rows.length === 0) return;
    }
  }

  async function carryFile(media, tenant, collection) {
    if (!media?.url) return null;
    const from = /^https?:\/\//.test(media.url) ? media.url : `${STRAPI}${media.url}`;
    const got = await plain(from);
    if (!got.ok) throw new Error(`downloading ${media.name || media.url}: HTTP ${got.status}`);
    const bytes = Buffer.from(await got.arrayBuffer());
    const up = await control(`/files?name=${encodeURIComponent(media.name || "file")}&tenant=${encodeURIComponent(tenant)}&collection=${collection}`, { method: "POST", body: bytes });
    const j = await up.json().catch(() => null);
    if (!up.ok) throw new Error(`storing ${media.name}: HTTP ${up.status} ${JSON.stringify(j)}`);
    return j.data;
  }

  let failed = false;
  for (const [uid, { collection, file }] of Object.entries(TYPES)) {
    const seen = new Set();
    let read = 0, added = 0, skipped = 0, moved = 0, files = 0, unassigned = 0;
    const handle = async (row, tenant) => {
      const id = row.documentId;
      read++;
      seen.add(id);
      const there = await control(`/records/${collection}/${encodeURIComponent(id)}`);
      if (there.ok) {
        skipped++;
      } else if (!dry) {
        const doc = Object.fromEntries(Object.entries(row).filter(([k, v]) => !DROP.has(k) && v !== undefined));
        doc.tenantKey = tenant;
        if (file) {
          const meta = await carryFile(row[file], tenant, collection);
          if (meta) { doc[file] = meta; files++; } else delete doc[file];
        }
        const w = await control(`/records/${collection}/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([doc]) });
        const res = await w.json().catch(() => null);
        if (!w.ok) throw new Error(`${id}: import failed: HTTP ${w.status} ${JSON.stringify(res)}`);
        added += res.added;
        skipped += res.skipped;
      }
      if (move && !dry) {
        const check = await control(`/records/${collection}/${encodeURIComponent(id)}`);
        if (!check.ok) throw new Error(`${id}: not in the control plane after the import, so it is not deleted from Strapi`);
        const del = await strapi(`/content-manager/collection-types/${uid}/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!del.ok) throw new Error(`${id}: deleting it from Strapi: HTTP ${del.status}`);
        moved++;
      }
    };
    try {
      for (const key of keys) for await (const row of rowsOf(uid, key)) if (!seen.has(row.documentId)) await handle(row, key);
      // rows no tenant filter reached: reported, and filed under --default-tenant when one is given
      for await (const row of rowsOf(uid)) {
        if (seen.has(row.documentId)) continue;
        unassigned++;
        if (DEFAULT_TENANT) await handle(row, DEFAULT_TENANT);
      }
    } catch (e) {
      console.error(`${collection}: ${e.message}`);
      failed = true;
    }
    console.log(`${collection}: read ${read}${dry ? ", nothing written" : `: ${added} added, ${skipped} already there${file ? `, ${files} file(s) carried` : ""}${move ? `, ${moved} deleted from Strapi` : ""}`}${unassigned ? `; ${unassigned} row(s) had no tenant${DEFAULT_TENANT ? ` (filed under ${DEFAULT_TENANT})` : " and were left (use --default-tenant)"}` : ""}`);
  }
  return failed ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (e) => { if (e.exit) process.exitCode = e.exit; else { console.error(e); process.exitCode = 1; } });
