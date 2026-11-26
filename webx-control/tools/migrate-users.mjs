#!/usr/bin/env node
// Copies Strapi's admin users, workspaces' sign-in settings and custom roles into webx-control (track C4, steps 3 and 4,
// decisions D10 and D22). No passwords move: people sign in at an OIDC provider, or, until Studio signs in through webx-control,
// at Strapi as now. Copying switches nothing: every workspace stays `legacy`, and Strapi stays the source until one switches.
//
//   STRAPI_URL=http://localhost:1337 STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... \
//   WEBX_CONTROL_URL=http://localhost:1400 WEBX_CONTROL_ADMIN_TOKEN=... WEBX_CONTROL_SERVICE_TOKEN=... \
//   [WEBX_ENCRYPTION_KEY=<Studio's>] \
//     node tools/migrate-users.mjs [--dry-run] [--promote <tenant>:<email> ...]
//
// It speaks for Strapi's workspaces only. What it writes, in this order:
//  - custom roles of Strapi's workspaces: control's `custom-role` records made the same as Strapi's (created and changed first;
//    the ones Strapi no longer has are removed at the very end), so the roles the memberships name exist (service token).
//  - each workspace's sign-in settings, `legacy`: the SSO provider and client, its client secret (decrypted here with Studio's
//    WEBX_ENCRYPTION_KEY and sealed by control under WEBX_CONTROL_SECRET_KEY), and the MFA requirement with the date it began.
//  - users: workspaces from the tenants' adminEmails, base role from the Strapi role, custom role from customRoleAssignments,
//    disabled when inactive or blocked (users-map.mjs). A user already in control is replaced, which ends their sessions if
//    something was taken away, but keeps their memberships of workspaces only control knows (a Rust-engine workspace, say); users
//    that are only in control are left alone, as are custom roles of workspaces Strapi does not know.
//
// Before writing it prints, per workspace, who keeps managing it and who no longer does (today every member manages people, roles
// and SSO; in control only an `admin` without a custom role does), and it stops, writing nothing, when a workspace would be left
// with no admin (name one with --promote), when a secret cannot be carried, when something would be refused by control (a workspace
// key, an e-mail address, a custom role's key), or when any workspace control knows already signs in through it (its people are
// kept there then, not copied from Strapi). Safe to run again while every workspace is legacy.
//
// Exit code: 0 done (or a clean dry run), 1 stopped or failed (why is on stderr), 2 a setting is missing.
import { createDecipheriv } from "node:crypto";
import { mapUsers, mapWorkspace } from "./users-map.mjs";

/** A reason to stop, said on stderr with an exit code. The process is never ended with process.exit: on Windows that can abort
 *  while fetch's connections close, and the exit code is lost. */
class Stop extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}
const stop = (m) => { throw new Stop(m); };

/** Studio's lib/crypto.ts: AES-256-GCM, iv.ciphertext.tag, each base64 */
function studioDecrypt(key) {
  const k = Buffer.from(key, "base64");
  if (k.length !== 32) throw new Stop("WEBX_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes", 2);
  return (payload) => {
    const [iv, ct, tag] = String(payload || "").split(".");
    if (!iv || !ct || !tag) throw new Error("malformed");
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  };
}

async function main() {
  const need = (k) => { const v = process.env[k]; if (!v) throw new Stop(`${k} is required`, 2); return v; };
  const STRAPI = need("STRAPI_URL").replace(/\/$/, "");
  const CONTROL = need("WEBX_CONTROL_URL").replace(/\/$/, "");
  const ADMIN = need("WEBX_CONTROL_ADMIN_TOKEN");
  const SERVICE = need("WEBX_CONTROL_SERVICE_TOKEN");
  const dry = process.argv.includes("--dry-run");
  const promote = process.argv.flatMap((a, i) => (a === "--promote" && process.argv[i + 1] ? [process.argv[i + 1]] : []));
  const SECRET = process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {};
  const decrypt = process.env.WEBX_ENCRYPTION_KEY ? studioDecrypt(process.env.WEBX_ENCRYPTION_KEY) : null;

  const login = await fetch(`${STRAPI}/admin/login`, { method: "POST", headers: { "content-type": "application/json", ...SECRET }, body: JSON.stringify({ email: need("STRAPI_ADMIN_EMAIL"), password: need("STRAPI_ADMIN_PASSWORD") }) });
  const jwt = (await login.json().catch(() => null))?.data?.token;
  if (!login.ok || !jwt) stop(`Strapi login failed (${login.status})`);
  const H = { Authorization: `Bearer ${jwt}`, ...SECRET };

  const all = async (path, pick) => {
    const rows = [];
    for (let page = 1; ; page++) {
      const r = await fetch(`${STRAPI}${path}${path.includes("?") ? "&" : "?"}page=${page}&pageSize=100`, { headers: H });
      if (!r.ok) stop(`${path} page ${page}: HTTP ${r.status}`);
      const j = await r.json();
      const got = pick(j);
      rows.push(...got);
      const pages = j.pagination?.pageCount ?? j.data?.pagination?.pageCount ?? 1;
      if (page >= pages || got.length === 0) return rows;
    }
  };
  const control = async (method, path, token, body) => {
    const r = await fetch(`${CONTROL}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, ok: r.ok, json, text };
  };

  const strapiUsers = await all("/admin/users", (j) => j.data?.results ?? j.results ?? []);
  const tenants = await all("/content-manager/collection-types/api::tenant.tenant", (j) => j.results ?? j.data ?? []);
  const customRoles = await all("/content-manager/collection-types/api::custom-role.custom-role", (j) => j.results ?? j.data ?? []);

  // A workspace that already signs in through webx-control keeps its people there: copying Strapi's over them would undo that. Every
  // workspace control has settings for counts, one Strapi does not know included (a Rust-engine workspace, or one deleted in Studio).
  const ids = await control("GET", "/admin/identities", ADMIN);
  if (!ids.ok) stop(`webx-control: GET /admin/identities: HTTP ${ids.status} ${ids.text}`);
  const switched = ids.json.data.filter((w) => w.mode !== "legacy").map((w) => `${w.tenantKey} (${w.mode})`);
  if (switched.length) stop(`already signs in through webx-control: ${switched.join(", ")}. This copy only runs while every workspace is legacy`);
  // the workspaces this copy speaks for: Strapi's. What control holds for any other workspace is left as it is
  const ours = new Set(tenants.map((t) => t.key));

  const { users, report, notes, blocking: found } = mapUsers(strapiUsers, tenants, { promote, customRoles });
  const workspaces = tenants.map((t) => ({ key: t.key, ...mapWorkspace(t, decrypt) }));
  for (const w of workspaces) { notes.push(...w.notes); found.push(...w.blocking); }
  const blocking = [...new Set(found)];
  // a person control already has keeps the memberships of workspaces Strapi does not know
  for (const u of users) {
    const r = await control("GET", `/admin/users/${encodeURIComponent(u.email)}`, ADMIN);
    if (r.status === 404) continue;
    if (!r.ok) stop(`webx-control: GET /admin/users/${u.email}: HTTP ${r.status} ${r.text}`);
    const kept = (r.json.data.memberships || []).filter((m) => !ours.has(m.tenantKey));
    if (kept.length) {
      u.body.memberships.push(...kept.map((m) => ({ tenantKey: m.tenantKey, role: m.role, customRole: m.customRole ?? null })));
      notes.push(`${u.email}: keeps ${kept.map((m) => m.tenantKey).join(", ")}, which only webx-control knows`);
    }
  }

  console.log("Who manages each workspace (an admin with no custom role), and who no longer does:");
  for (const r of report) {
    console.log(`  ${r.tenantKey}: ${r.members} member(s); admin: ${r.admins.join(", ") || "none"}${r.promoted.length ? ` (promoted: ${r.promoted.join(", ")})` : ""}`);
    if (r.losing.length) console.log(`    no longer manages people, roles, sign-in, security or the agent: ${r.losing.join(", ")}`);
  }
  for (const n of notes) console.log(`note: ${n}`);
  for (const u of users) {
    const where = u.body.memberships.map((m) => `${m.tenantKey}/${m.role}${m.customRole ? "+" + m.customRole : ""}`).join(", ");
    console.log(`${dry ? "would write" : "write"} ${u.email}: ${u.body.superAdmin ? "super admin" : where || "no workspace"}${u.body.disabled ? " (disabled)" : ""}`);
  }
  for (const w of workspaces.filter((w) => w.body)) {
    console.log(`${dry ? "would write" : "write"} the sign-in settings of ${w.key}: legacy${w.body.issuer ? `, provider ${w.body.issuer}` : ""}${w.body.clientSecret ? ", client secret" : ""}${w.body.mfaRequired ? ", MFA required" : ""}`);
  }
  if (blocking.length) {
    for (const b of blocking) console.error(`stop: ${b}`);
    stop(dry ? "dry run: the copy would stop here, and nothing was written" : "nothing was written");
  }
  if (dry) {
    console.log(`dry run: ${users.length} user(s), ${workspaces.filter((w) => w.body).length} workspace setting(s) and ${customRoles.length} custom role(s) read from Strapi, nothing written`);
    return;
  }

  // custom roles of Strapi's workspaces: made the same as Strapi's. What is added or changed goes first; what Strapi no longer has is
  // removed only at the very end, once everything else is written
  const theirs = new Map();
  for (let page = 1; ; page++) {
    const r = await control("GET", `/internal/records/custom-role?pageSize=500&page=${page}`, SERVICE);
    if (!r.ok) stop(`webx-control: GET /internal/records/custom-role: HTTP ${r.status} ${r.text}`);
    for (const row of r.json.data) if (ours.has(row.tenantKey)) theirs.set(row.documentId, row);
    if (page >= (r.json.meta?.pagination?.pageCount ?? 1)) break;
  }
  let rolesMade = 0, rolesChanged = 0, rolesRemoved = 0;
  for (const cr of customRoles.filter((cr) => ours.has(cr.tenantKey))) {
    const data = { tenantKey: cr.tenantKey, roleKey: cr.roleKey, name: cr.name, permissions: cr.permissions || {} };
    if (theirs.has(cr.documentId)) {
      const r = await control("PUT", `/internal/records/custom-role/${encodeURIComponent(cr.documentId)}`, SERVICE, { data });
      if (!r.ok) stop(`custom role ${cr.tenantKey}/${cr.roleKey}: HTTP ${r.status} ${r.text}`);
      theirs.delete(cr.documentId);
      rolesChanged++;
    } else {
      const r = await control("POST", "/internal/records/custom-role/import", SERVICE, [{ ...data, documentId: cr.documentId, createdAt: cr.createdAt, updatedAt: cr.updatedAt }]);
      if (!r.ok) stop(`custom role ${cr.tenantKey}/${cr.roleKey}: HTTP ${r.status} ${r.text}`);
      rolesMade++;
    }
  }

  let settings = 0;
  for (const w of workspaces.filter((w) => w.body)) {
    const r = await control("PUT", `/admin/tenants/${encodeURIComponent(w.key)}/identity`, ADMIN, w.body);
    if (!r.ok) stop(`the sign-in settings of ${w.key}: HTTP ${r.status} ${r.text}`);
    settings++;
  }

  let created = 0, replaced = 0;
  for (const u of users) {
    const r = await control("PUT", `/admin/users/${encodeURIComponent(u.email)}`, ADMIN, u.body);
    if (!r.ok) stop(`${u.email}: HTTP ${r.status} ${r.text}`);
    r.status === 201 ? created++ : replaced++;
  }

  for (const id of theirs.keys()) {
    const r = await control("DELETE", `/internal/records/custom-role/${encodeURIComponent(id)}`, SERVICE);
    if (!r.ok) stop(`custom role ${id}: HTTP ${r.status} ${r.text}`);
    rolesRemoved++;
  }
  console.log(`${users.length} user(s): ${created} created, ${replaced} replaced; ${settings} workspace setting(s); custom roles: ${rolesMade} made, ${rolesChanged} brought up to date, ${rolesRemoved} removed`);
}

main().then(
  () => { process.exitCode = 0; },
  (e) => {
    console.error(e instanceof Stop ? e.message : e);
    process.exitCode = e instanceof Stop ? e.code : 1;
  },
);
