#!/usr/bin/env node
// Moves WordPress's form submissions (complaints, job applications and contact messages of the WordPress tenants, ORST and the
// Royal Society) and the files attached to them into webx-control (decision D6). Optional: new submissions already go to
// webx-control and Studio lists WordPress's next to them, so nothing has to be moved. Move them before WordPress's copies are
// retired. tools/migrate-forms.mjs does the same from Strapi; this one follows it.
//
//   WORDPRESS_URL=http://localhost:8080/wp-json WP_USER=... WP_APP_PASSWORD=... WEBX_WP_PII_KEY=... \
//   WEBX_CONTROL_URL=http://localhost:1400 WEBX_CONTROL_SERVICE_TOKEN=... \
//     node tools/migrate-wp-forms.mjs [--dry-run] [--move] [--default-tenant <key>]
//
// webx-control must be running with WEBX_PII_KEY set. WP_USER is a WordPress administrator with an application password, not one
// tenant's own admin: WordPress's tenant backstop lets a tenant's admin delete only that tenant's posts, and --move deletes.
//
// Each post of the types complaint, application and contact-message (wordpress/mu-plugins/public-forms-*.php) becomes a row of
// the webx-control collection of the same name, read over REST with context=edit (the title as stored) and status=any (an
// unpublished post is still a submission): its ACF fields, its post time as createdAt and updatedAt, and, for a contact
// message, its title as the sender's name (WordPress keeps it there). steps and extra are JSON text in WordPress and become JSON.
// The workspace is the slug of the post's `wtenant` term; a post with none is reported, and filed under --default-tenant if given.
//
// Personal data: WordPress keeps name, email and phone encrypted under WEBX_WP_PII_KEY (wordpress/mu-plugins/pii-crypto.php:
// AES-256-GCM, base64 iv.ciphertext.tag, dot-joined, a 12-byte IV). The tool decrypts it and sends it plain, and webx-control
// encrypts it under its own key. A value not in that format goes as it is: a row from before the encryption, or a plain value
// WordPress's loose check took for ciphertext and so never encrypted (02.123.4567; a warning names it). One in the format that does
// not decrypt (the wrong key, or damaged data) stops the run, naming the post: everything is read and decrypted before anything is
// written, so nothing is.
//
// documentId: `wp-<collection>-<post id>` (wp-complaint-123). It is stable, so a second run skips what is there, and it is never
// one of webx-control's or Strapi's own (24 letters and digits). It is not the bare post id, because Studio calls WordPress's copy
// by that and looks an id up in the control plane first: its edits and deletes of WordPress's copy would reach the moved row. A row
// already there under the id with another reference (a contact message: another time) is another submission, as when a WordPress
// starts its ids again: its form stops there rather than skip the post or, with --move, delete it.
//
// Files: a complaint's attachment and an application's résumé are attachment ids. Each is looked up (/wp/v2/media), downloaded
// from its source_url (without the credentials, which are WordPress's and not the file host's) and stored by webx-control,
// encrypted, as migrate-forms.mjs stores Strapi's.
//
//   --dry-run          read, decrypt (so it checks the key) and report; write nothing
//   --move             after a row is safely in the control plane, delete its post from WordPress, for good (?force=true), and
//                      then its file from WordPress's media library: an attachment or a résumé is personal data, and WordPress
//                      serves its uploads to anyone who has the URL. A file already gone counts as deleted; one WordPress refuses
//                      to delete is reported, to be deleted there by hand. Without --move, Studio lists a moved row twice until
//                      WordPress's copy is deleted.
//   --default-tenant   the workspace of a post that has no wtenant term
//
// At the end it prints, per workspace, the prefix its WordPress reference numbers start with (orst: ORST, royalsociety: RS) and the
// admin call that keeps it for new submissions (webx-control's form settings; that call needs WEBX_CONTROL_ADMIN_TOKEN, which this
// tool does not use).
//
// Exit code: 0 done, 1 something failed (what is said on stderr), 2 a setting is missing or the flags do not fit.
import { createDecipheriv } from "node:crypto";

// the REST base of each type (public-forms-post-types.php), its file field, and what WordPress encrypts (public-forms-api.php:
// a contact message's sender is the post's title, which it keeps plain)
const TYPES = {
  complaint: { restBase: "complaint", file: "attachment", pii: ["name", "email", "phone"] },
  application: { restBase: "application", file: "resume", pii: ["name", "email", "phone"] },
  "contact-message": { restBase: "contact-message", pii: ["email", "phone"] },
};
// ACF textareas that hold JSON (webx-studio/lib/cms/wordpress.ts, ACF_JSON_FIELDS)
const JSON_TEXT = ["steps", "extra"];
// what webx-control takes as a workspace's reference prefix (form_settings.rs, valid_prefix)
const PREFIX_OK = /^[A-Z][A-Z0-9]{1,11}$/;

/** pii-crypto.php's webx_pii_looks_encrypted(): three non-empty base64 parts, dot-joined */
function looksEncrypted(v) {
  if (typeof v !== "string") return false;
  const parts = v.split(".");
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p));
}

/** What webx_pii_encrypt() writes, exactly: a 12-byte IV (16 base64 characters), the ciphertext, a 16-byte tag (22 and ==).
 * WordPress's own test above is looser, so a plain value such as the phone number 02.123.4567 passes it, and
 * webx_pii_encrypt_if_needed() then stored it as it was sent: plain text, not a value to decrypt. */
function inCipherFormat(v) {
  const p = typeof v === "string" ? v.split(".") : [];
  return p.length === 3 && /^[A-Za-z0-9+/]{16}$/.test(p[0]) && /^[A-Za-z0-9+/]+={0,2}$/.test(p[1]) && p[1].length % 4 === 0 && /^[A-Za-z0-9+/]{22}==$/.test(p[2]);
}

/** webx_pii_decrypt(): AES-256-GCM with a 12-byte IV and a 16-byte tag. Throws on the wrong key or a damaged value. */
function decrypter(key) {
  return (value) => {
    const [iv, ct, tag] = value.split(".").map((p) => Buffer.from(p, "base64"));
    if (iv.length !== 12 || tag.length !== 16) throw new Error("not a value pii-crypto.php wrote");
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  };
}

/** A WordPress time as webx-control writes times (2025-01-01T01:00:00.000Z). WordPress gives the GMT one without a zone; a post
 * that has none (a draft never published) falls back to the site's own time, read as GMT. */
function iso(gmt, local) {
  for (const s of [gmt, local]) {
    if (typeof s !== "string" || !s || s.startsWith("0000")) continue;
    const d = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

/** The attachment id an ACF file field holds: a number with ACF's REST format, an object if a site formats it; empty is "" or false. */
const mediaId = (v) => Number(v && typeof v === "object" ? (v.ID ?? v.id) : v) || 0;

/** A post as the row webx-control keeps, and the id of its file. Throws, naming the post, on a value that does not decrypt. */
function toRow(post, collection, tenant, decrypt, warn) {
  const { file, pii } = TYPES[collection];
  const acf = post.acf;
  // a post without its fields would move as an empty shell: ACF is off, or its field group is not shown in REST
  if (!acf || typeof acf !== "object" || Array.isArray(acf)) throw new Error(`post ${post.id}: WordPress sent no ACF fields (is ACF active, with show_in_rest on the field group?)`);
  const doc = {};
  for (const [k, v] of Object.entries(acf)) if (v !== null && v !== undefined) doc[k] = v;
  if (collection === "contact-message") {
    const title = post.title?.raw ?? post.title?.rendered ?? post.title;
    if (typeof title === "string") doc.name = title;
  }
  for (const f of pii) {
    if (!looksEncrypted(doc[f])) continue; // a row from before the encryption, or an empty value
    if (!inCipherFormat(doc[f])) { warn(`post ${post.id}: ${f} only looks encrypted (WordPress kept it as sent), so it is moved as plain text`); continue; }
    try {
      doc[f] = decrypt(doc[f]);
    } catch {
      throw new Error(`post ${post.id}: ${f} does not decrypt with WEBX_WP_PII_KEY (the wrong key, or a damaged value)`);
    }
  }
  for (const f of JSON_TEXT) {
    if (typeof doc[f] !== "string") continue;
    if (!doc[f].trim()) { delete doc[f]; continue; }
    try { doc[f] = JSON.parse(doc[f]); } catch { warn(`post ${post.id}: ${f} is not JSON, kept as text`); }
  }
  // ACF's REST format gives numbers and flags as such; a site that formats them otherwise sends text
  if (typeof doc.stage === "string" && doc.stage.trim() !== "" && Number.isFinite(Number(doc.stage))) doc.stage = Number(doc.stage);
  for (const f of ["anonymous", "handled"]) if (f in doc && typeof doc[f] !== "boolean") doc[f] = ["1", "true", 1].includes(doc[f]);
  const media = file ? mediaId(doc[file]) : 0;
  if (file) delete doc[file]; // replaced by what webx-control keeps of the file once it is stored
  // the workspace, id and times are the tool's, whatever a field is called
  Object.assign(doc, { documentId: `wp-${collection}-${post.id}`, tenantKey: tenant, createdAt: iso(post.date_gmt, post.date) });
  doc.updatedAt = iso(post.modified_gmt, post.modified) ?? doc.createdAt;
  return { id: post.id, doc, media };
}

/** ORST of ORST-CMP-2569-123456: what precedes the kind, the Buddhist year and the number. */
function refParts(ref) {
  const p = typeof ref === "string" ? ref.split("-") : [];
  return p.length >= 4 && /^\d{4}$/.test(p.at(-2)) && /^\d+$/.test(p.at(-1)) ? { prefix: p.slice(0, -3).join("-"), kind: p.at(-3) } : null;
}

/** Whether the row the control plane has under a post's id is that post: the same reference, or, without one, the same time. */
const sameSubmission = (doc, there) => (doc.ref ? there.ref === doc.ref : doc.createdAt === undefined || there.createdAt === doc.createdAt);

/** The prefixes each workspace's WordPress references start with, and the admin call that keeps one for new submissions
 * (webx-control makes <prefix>-CMP-<year>-<number>, with DGA for a workspace that has none of its own). */
function reportPrefixes(prefixes, appRefs) {
  if (!prefixes.size) return;
  const ordered = [...prefixes].sort(([a], [b]) => a.localeCompare(b)).map(([ws, counts]) => [ws, [...counts].sort((a, b) => b[1] - a[1])]);
  console.log(`\nreference prefixes in WordPress: ${ordered.map(([ws, c]) => `${ws}: ${c.map(([p, n]) => (c.length > 1 ? `${p} (${n})` : p)).join(", ")}`).join("; ")}`);
  console.log(`to keep them for new submissions, give each workspace its prefix in webx-control (admin token, WEBX_CONTROL_ADMIN_TOKEN; a PUT replaces the workspace's form settings, so add its "notifyEmail" if it has one):`);
  for (const [ws, [[p]]] of ordered) {
    console.log(PREFIX_OK.test(p) ? `  PUT /admin/tenants/${ws}/forms {"refPrefix": "${p}"}` : `  ${ws}: ${p} cannot be kept (a capital letter, then capitals or digits, 2 to 12 characters)`);
  }
  if (appRefs) console.log(`note: WordPress's application references read <prefix>-APP-...; webx-control's new ones read <prefix>-JOB-... (the moved ones keep theirs, and are tracked by them)`);
}

async function main() {
  const need = (k) => { const v = process.env[k]; if (!v) { console.error(`${k} is required`); throw Object.assign(new Error(), { exit: 2 }); } return v; };
  const WP = need("WORDPRESS_URL").replace(/\/+$/, "");
  const CONTROL = need("WEBX_CONTROL_URL").replace(/\/+$/, "");
  const TOKEN = need("WEBX_CONTROL_SERVICE_TOKEN");
  const AUTH = `Basic ${Buffer.from(`${need("WP_USER")}:${need("WP_APP_PASSWORD")}`).toString("base64")}`;
  const rawKey = need("WEBX_WP_PII_KEY").trim();
  const key = Buffer.from(rawKey, "base64");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(rawKey) || key.length !== 32) { console.error("WEBX_WP_PII_KEY must be WordPress's key: base64 that decodes to exactly 32 bytes"); return 2; }
  const decrypt = decrypter(key);
  let dry = false, move = false, DEFAULT_TENANT = "";
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dry = true;
    else if (args[i] === "--move") move = true;
    else if (args[i] === "--default-tenant" && args[i + 1] && !args[i + 1].startsWith("-")) DEFAULT_TENANT = args[++i];
    // an unknown flag is refused rather than ignored: a mistyped --dry-run would otherwise write
    else { console.error(args[i] === "--default-tenant" ? "--default-tenant needs a workspace key" : `unknown flag ${args[i]}`); return 2; }
  }
  if (dry && move) { console.error("--dry-run and --move together would do nothing"); return 2; }
  // connections are not kept alive: the tool ends as soon as it is done
  const plain = (url, init = {}) => fetch(url, { ...init, headers: { connection: "close", ...(init.headers || {}) } });
  const wp = (path, init = {}) => plain(`${WP}${path}`, { ...init, headers: { authorization: AUTH, ...(init.headers || {}) } });
  const control = (path, init = {}) => plain(`${CONTROL}/internal${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) } });

  // both ends are checked before anything is read: WordPress takes the credentials; webx-control the token, with a PII key
  const me = await wp("/wp/v2/users/me?context=edit");
  if (!me.ok) { console.error(`WordPress did not take WP_USER and WP_APP_PASSWORD at ${WP}/wp/v2/users/me: HTTP ${me.status}${me.status === 404 ? " (WORDPRESS_URL should end in /wp-json)" : ""}`); return 1; }
  const ping = await control("/records/complaint?pageSize=1");
  if (!ping.ok) { console.error(`webx-control's records API at ${CONTROL} answered HTTP ${ping.status} (check WEBX_CONTROL_SERVICE_TOKEN, and that it runs with WEBX_PII_KEY)`); return 1; }

  /** every item of a WordPress list, a page at a time (at most 100 a page; WordPress says how many pages there are) */
  async function* pages(path) {
    for (let page = 1; ; page++) {
      const r = await wp(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      // WordPress says why (an account that may not read drafts or edit context gets a 400 or 401 here)
      if (!r.ok) throw new Error(`reading ${path.split("?")[0]} page ${page}: HTTP ${r.status} ${(await r.json().catch(() => null))?.message ?? ""}`.trim());
      const items = await r.json();
      yield* items;
      const total = Number(r.headers.get("x-wp-totalpages"));
      if ((total ? page >= total : items.length < 100) || items.length === 0) return;
    }
  }

  /** the row the control plane holds under this id, or null; any answer but 404 is an error worth stopping for */
  async function held(collection, id) {
    const r = await control(`/records/${collection}/${encodeURIComponent(id)}`);
    if (r.status === 404) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`reading ${id} from the control plane: HTTP ${r.status} ${JSON.stringify(j?.error?.message ?? j)}`);
    return j.data;
  }

  async function carryFile(row, tenant, collection) {
    const m = await wp(`/wp/v2/media/${row.media}?context=edit`);
    const source = m.ok ? (await m.json().catch(() => null))?.source_url : null;
    if (!source) throw new Error(`post ${row.id}: its file, media ${row.media}: ${m.ok ? "no source_url" : `HTTP ${m.status}`}`);
    const url = new URL(source, WP);
    const last = url.pathname.split("/").pop() || "";
    let name;
    try { name = decodeURIComponent(last) || "file"; } catch { name = last; }
    const got = await plain(url);
    if (!got.ok) throw new Error(`post ${row.id}: downloading ${name}: HTTP ${got.status}`);
    const bytes = Buffer.from(await got.arrayBuffer());
    const up = await control(`/files?name=${encodeURIComponent(name)}&tenant=${encodeURIComponent(tenant)}&collection=${collection}`, { method: "POST", body: bytes });
    const j = await up.json().catch(() => null);
    if (!up.ok) throw new Error(`post ${row.id}: storing ${name}: HTTP ${up.status} ${JSON.stringify(j)}`);
    return j.data;
  }

  // 1. read and decrypt everything, so a key that does not fit stops the run before it writes anything
  const slugOf = new Map();
  const plan = [];
  const prefixes = new Map(); // workspace -> prefix -> how many references
  let appRefs = false;
  let reading = "wtenant";
  try {
    for await (const t of pages("/wp/v2/wtenant")) slugOf.set(t.id, t.slug);
    for (const [collection, type] of Object.entries(TYPES)) {
      reading = collection;
      const rows = [], unassigned = [];
      const warn = (m) => console.warn(`warning: ${collection}: ${m}`);
      for await (const post of pages(`/wp/v2/${type.restBase}?context=edit&status=any&orderby=id&order=asc&acf_format=light`)) {
        let tenant = slugOf.get(Array.isArray(post.wtenant) ? post.wtenant[0] : undefined);
        if (!tenant) {
          unassigned.push(post.id);
          if (!DEFAULT_TENANT) continue;
          tenant = DEFAULT_TENANT;
        }
        const row = toRow(post, collection, tenant, decrypt, warn);
        rows.push({ ...row, tenant });
        const ref = refParts(row.doc.ref);
        if (ref) {
          if (!prefixes.has(tenant)) prefixes.set(tenant, new Map());
          prefixes.get(tenant).set(ref.prefix, (prefixes.get(tenant).get(ref.prefix) || 0) + 1);
          if (collection === "application" && ref.kind === "APP") appRefs = true;
        }
      }
      plan.push({ collection, ...type, rows, unassigned });
    }
  } catch (e) {
    console.error(`${reading}: ${e.message}; nothing was written`);
    return 1;
  }

  // 2. write each form's rows, as migrate-forms.mjs does: a failure stops that form and the run goes on to the next
  let failed = false;
  for (const { collection, restBase, file, rows, unassigned } of plan) {
    let added = 0, skipped = 0, moved = 0, files = 0, filesDeleted = 0;
    try {
      for (const row of rows) {
        const { doc } = row;
        const there = await held(collection, doc.documentId);
        if (there && !sameSubmission(doc, there)) {
          throw new Error(`post ${row.id}: ${doc.documentId} is already in the control plane as another submission (${doc.ref ? `reference ${there.ref}, not ${doc.ref}` : `made ${there.createdAt}, not ${doc.createdAt}`}), so the post is neither skipped nor deleted`);
        }
        if (there) {
          skipped++;
        } else if (!dry) {
          const meta = row.media ? await carryFile(row, row.tenant, collection) : null;
          if (meta) { doc[file] = meta; files++; }
          const w = await control(`/records/${collection}/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([doc]) });
          const res = await w.json().catch(() => null);
          if (!w.ok) {
            // the file stored for it goes too, so a row that failed leaves nothing behind
            if (meta) await control(`/files/${encodeURIComponent(meta.documentId)}`, { method: "DELETE" }).catch(() => {});
            throw new Error(`post ${row.id}: import failed: HTTP ${w.status} ${JSON.stringify(res)}`);
          }
          added += res.added;
          skipped += res.skipped;
        }
        if (move && !dry) {
          const check = there ?? (await held(collection, doc.documentId));
          if (!check || !sameSubmission(doc, check)) throw new Error(`post ${row.id}: not in the control plane after the import, so it is not deleted from WordPress`);
          const del = await wp(`/wp/v2/${restBase}/${row.id}?force=true`, { method: "DELETE" });
          if (!del.ok) throw new Error(`post ${row.id}: deleting it from WordPress: HTTP ${del.status} ${(await del.json().catch(() => null))?.message ?? ""}`.trim());
          moved++;
          // its file goes too, now that the control plane keeps it encrypted: WordPress serves an upload to anyone with the URL
          if (row.media) {
            const dm = await wp(`/wp/v2/media/${row.media}?force=true`, { method: "DELETE" });
            if (dm.ok) filesDeleted++;
            else if (dm.status !== 404) throw new Error(`post ${row.id}: deleted, but its file, media ${row.media}, was not: HTTP ${dm.status} ${(await dm.json().catch(() => null))?.message ?? ""}; delete it in WordPress's media library`);
          }
        }
      }
    } catch (e) {
      console.error(`${collection}: ${e.message}`);
      failed = true;
    }
    console.log(`${collection}: read ${rows.length}${dry ? ", nothing written" : `: ${added} added, ${skipped} already there${file ? `, ${files} file(s) carried` : ""}${move ? `, ${moved} deleted from WordPress${file ? ` with ${filesDeleted} file(s)` : ""}` : ""}`}${unassigned.length ? `; ${unassigned.length} post(s) had no tenant${DEFAULT_TENANT ? ` (filed under ${DEFAULT_TENANT})` : " and were left (use --default-tenant)"}: ${unassigned.join(", ")}` : ""}`);
  }
  reportPrefixes(prefixes, appRefs);
  return failed ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (e) => { if (e.exit) process.exitCode = e.exit; else { console.error(e); process.exitCode = 1; } });
