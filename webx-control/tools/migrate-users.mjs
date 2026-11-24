#!/usr/bin/env node
// Moves Strapi's admin users into webx-control (track C4, decision D10): who they are, which workspaces they
// belong to and their role there. No passwords move: people sign in at an OIDC provider, or, until Studio
// signs in through webx-control, at Strapi as now. Safe to run again: it replaces each user by email.
//
//   STRAPI_URL=http://localhost:1337 STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... \
//   WEBX_CONTROL_URL=http://localhost:1400 WEBX_CONTROL_ADMIN_TOKEN=... \
//     node tools/migrate-users.mjs [--dry-run]
//
// A workspace is a tenant that lists the user in its adminEmails, as Studio scopes an editor today.
// Custom-role assignments (tenant.customRoleAssignments) are not moved yet.
import { mapUsers } from "./users-map.mjs";

const env = (k) => { const v = process.env[k]; if (!v) { console.error(`${k} is required`); process.exit(2); } return v; };
const STRAPI = env("STRAPI_URL").replace(/\/$/, "");
const CONTROL = env("WEBX_CONTROL_URL").replace(/\/$/, "");
const ADMIN = env("WEBX_CONTROL_ADMIN_TOKEN");
const dry = process.argv.includes("--dry-run");
const SECRET = process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {};

const login = await fetch(`${STRAPI}/admin/login`, { method: "POST", headers: { "content-type": "application/json", ...SECRET }, body: JSON.stringify({ email: env("STRAPI_ADMIN_EMAIL"), password: env("STRAPI_ADMIN_PASSWORD") }) });
const jwt = (await login.json())?.data?.token;
if (!login.ok || !jwt) { console.error(`Strapi login failed (${login.status})`); process.exit(1); }
const H = { Authorization: `Bearer ${jwt}`, ...SECRET };

async function all(path, pick) {
  const rows = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${STRAPI}${path}${path.includes("?") ? "&" : "?"}page=${page}&pageSize=100`, { headers: H });
    if (!r.ok) { console.error(`${path} page ${page}: HTTP ${r.status}`); process.exit(1); }
    const j = await r.json();
    const got = pick(j);
    rows.push(...got);
    const pages = j.pagination?.pageCount ?? j.data?.pagination?.pageCount ?? 1;
    if (page >= pages || got.length === 0) return rows;
  }
}
const strapiUsers = await all("/admin/users", (j) => j.data?.results ?? j.results ?? []);
const tenants = await all("/content-manager/collection-types/api::tenant.tenant", (j) => j.results ?? j.data ?? []);
const { users, problems } = mapUsers(strapiUsers, tenants);
for (const p of problems) console.error("skipped: " + p);

let created = 0, replaced = 0;
for (const u of users) {
  console.log(`${dry ? "would write" : "write"} ${u.email}: ${u.body.superAdmin ? "super admin" : u.body.memberships.map((m) => `${m.tenantKey}/${m.role}`).join(", ") || "no workspace"}${u.body.disabled ? " (disabled)" : ""}`);
  if (dry) continue;
  const r = await fetch(`${CONTROL}/admin/users/${encodeURIComponent(u.email)}`, { method: "PUT", headers: { Authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body: JSON.stringify(u.body) });
  if (!r.ok) { console.error(`${u.email}: HTTP ${r.status} ${await r.text()}`); process.exit(1); }
  r.status === 201 ? created++ : replaced++;
}
console.log(dry ? `dry run: ${users.length} user(s) read from Strapi, nothing written` : `${users.length} user(s): ${created} created, ${replaced} replaced`);
