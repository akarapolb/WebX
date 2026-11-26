#!/usr/bin/env node
// C4 step 3: tools/migrate-users.mjs against the real webx-control binary and a fake Strapi (a small HTTP server that answers the
// calls the tool makes: login, the admin users, the tenants and the custom roles). What is checked: the report of who keeps and who
// loses managing a workspace, the refusal to leave one with no admin, base and custom roles, disabled accounts, a workspace's
// provider with its client secret carried from Studio's encryption to control's (read back by the broker once it switches), the MFA
// requirement with its start, custom roles made the same as Strapi's, a second run, and the refusal once a workspace has switched.
//
//   node tools/migrate-users-test.mjs [--port 1411]
//
// Needs the release build.
import { spawn } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1411");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "mu-admin-token", SERVICE = "mu-service-token", AUTH = "mu-broker-token";
const STUDIO_KEY = randomBytes(32).toString("base64"); // Studio's WEBX_ENCRYPTION_KEY
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const call = async (method, path, token, body) => {
  const r = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
/** as Studio's lib/crypto.ts encrypts */
const studioEncrypt = (plain) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(STUDIO_KEY, "base64"), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, ct, c.getAuthTag()].map((b) => b.toString("base64")).join(".");
};

const role = { editor: { code: "strapi-editor", name: "Editor" }, author: { code: "strapi-author", name: "Author" }, sup: { code: "strapi-super-admin", name: "Super Admin" }, lite: { code: "author-lite-1", name: "Author Lite" } };
const strapi = {
  users: [
    { email: "Ann@Example.org", firstname: "Ann", isActive: true, roles: [role.editor] }, // dga with a custom role
    { email: "bob@example.org", firstname: "Bob", isActive: true, roles: [role.editor] }, // dga: manages today, not after
    { email: "sue@example.org", firstname: "Sue", isActive: true, roles: [role.sup] }, // dga: its admin
    { email: "root@example.org", isActive: true, roles: [role.sup] }, // on no tenant: a super admin
    { email: "zed@example.org", isActive: true, blocked: true, roles: [role.author] }, // pea, blocked
    { email: "olu@example.org", isActive: true, roles: [role.lite] }, // pea, a role with no base role
    { email: "pat@example.org", isActive: true, roles: [role.editor] }, // pea: the one to promote
  ],
  tenants: [
    { key: "dga", adminEmails: ["ann@example.org", "bob@example.org", "sue@example.org"], customRoleAssignments: { "ann@example.org": "reviewer" },
      sso: { enabled: true, issuerUrl: "https://idp.example/realms/dga", clientId: "studio-dga", clientSecretEnc: studioEncrypt("dga-client-secret"), realm: "dga" },
      features: { security: { mfaRequired: true, mfaRequiredAt: "2026-10-01T00:00:00.000Z" } } },
    { key: "pea", adminEmails: ["zed@example.org", "olu@example.org", "pat@example.org"], customRoleAssignments: {} },
    { key: "orst", adminEmails: [] },
  ],
  roles: [
    { documentId: "crole00000000000000000001", tenantKey: "dga", roleKey: "reviewer", name: "Reviewer", permissions: { "api::faq.faq": { view: true, update: true } }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
  ],
};
const fake = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const json = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.method === "POST" && u.pathname === "/admin/login") return json({ data: { token: "jwt-fake" } });
  if (req.headers.authorization !== "Bearer jwt-fake") return json({ error: "no" }, 401);
  const page = Number(u.searchParams.get("page") || 1), size = Number(u.searchParams.get("pageSize") || 25);
  const slice = (all) => ({ results: all.slice((page - 1) * size, page * size), pagination: { page, pageSize: size, pageCount: Math.max(1, Math.ceil(all.length / size)), total: all.length } });
  if (u.pathname === "/admin/users") return json({ data: slice(strapi.users) });
  if (u.pathname === "/content-manager/collection-types/api::tenant.tenant") return json(slice(strapi.tenants));
  if (u.pathname === "/content-manager/collection-types/api::custom-role.custom-role") return json(slice(strapi.roles));
  json({ error: "nope" }, 404);
});
await new Promise((ok) => fake.listen(0, "127.0.0.1", ok));
const STRAPI = `http://127.0.0.1:${fake.address().port}`;

const dir = mkdtempSync(join(tmpdir(), "webx-migrate-users-"));
const server = spawn(exe, ["--port", PORT, "--db", join(dir, "control.db")], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_CONTROL_SERVICE_TOKEN: SERVICE, WEBX_CONTROL_AUTH_TOKEN: AUTH, WEBX_CONTROL_SECRET_KEY: randomBytes(32).toString("base64") }, stdio: ["ignore", "ignore", "inherit"] });
const stopped = new Promise((ok) => server.on("exit", ok));
// asynchronous on purpose: the fake Strapi lives in this process, so a blocking call here would leave it unable to answer the tool
const run = (args = [], env = {}) => new Promise((ok) => {
  const child = spawn(process.execPath, [join(root, "tools", "migrate-users.mjs"), ...args], { env: { ...process.env, STRAPI_URL: STRAPI, STRAPI_ADMIN_EMAIL: "a@b.c", STRAPI_ADMIN_PASSWORD: "x", WEBX_CONTROL_URL: BASE, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_CONTROL_SERVICE_TOKEN: SERVICE, WEBX_ENCRYPTION_KEY: STUDIO_KEY, ...env } });
  let out = "", err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  child.on("exit", (code) => ok({ code, out, err, all: out + err }));
});
const user = async (email) => (await call("GET", `/admin/users/${encodeURIComponent(email)}`, ADMIN)).json?.data;
const roles = async () => (await call("GET", "/internal/records/custom-role?pageSize=500", SERVICE)).json.data;

try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) break; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
  // a custom role control has and Strapi does not: the copy removes it
  await call("POST", "/internal/records/custom-role", SERVICE, { data: { tenantKey: "dga", roleKey: "stale", name: "Stale", permissions: {} } });

  const dry = await run(["--dry-run"]);
  check("a dry run reports who keeps and who loses managing each workspace (today every member manages people, roles and SSO)", /dga: 3 member\(s\); admin: sue@example\.org/.test(dry.out) && /no longer manages people, roles, sign-in, security or the agent: ann@example\.org \(editor \+ reviewer\), bob@example\.org \(editor\)/.test(dry.out), dry.all);
  check("it names what a Strapi role with no base role became, and today's on-the-spot accounts", /olu@example\.org: Strapi role "Author Lite" has no base role, read as viewer/.test(dry.out) && /dga: today SSO adds anyone the provider vouches for as Editor/.test(dry.out), dry.all);
  check("a workspace that would be left with no admin stops it (exit 1), naming today's managers", dry.code === 1 && /stop: pea would have no admin.*--promote pea:<email> \(today's: olu@example\.org, pat@example\.org\)/.test(dry.err), dry.all);
  check("and nothing was written", (await call("GET", "/admin/users", ADMIN)).json.data.length === 0 && (await call("GET", "/admin/tenants/dga/identity", ADMIN)).status === 404 && (await roles()).length === 1);

  const refused = await run();
  check("a real run stops the same way, before writing anything", refused.code === 1 && /nothing was written/.test(refused.err) && (await call("GET", "/admin/users", ADMIN)).json.data.length === 0, refused.all);
  check("a promotion of someone who is not a member stops it", (await run(["--promote", "pea:sue@example.org", "--dry-run"])).err.includes("sue@example.org is not a member of pea"));
  check("a secret it cannot decrypt stops it", /does not decrypt/.test((await run(["--promote", "pea:pat@example.org"], { WEBX_ENCRYPTION_KEY: randomBytes(32).toString("base64") })).err) && (await call("GET", "/admin/users", ADMIN)).json.data.length === 0);

  // a workspace only webx-control knows (a Rust-engine one, say), with Ann in it and a custom role of its own
  await call("PUT", "/admin/tenants/lab/identity", ADMIN, { mode: "both", issuer: "https://idp.example/realms/lab", clientId: "lab" });
  await call("PUT", "/admin/users/ann@example.org", ADMIN, { memberships: [{ tenantKey: "lab", role: "editor", customRole: "lab-role" }] });
  await call("POST", "/internal/records/custom-role", SERVICE, { data: { tenantKey: "lab", roleKey: "lab-role", name: "Lab", permissions: {} } });
  const labOn = await run(["--promote", "pea:pat@example.org"]);
  check("while any workspace control knows signs in through it, one Strapi does not know included, the copy stops", labOn.code === 1 && /already signs in through webx-control: lab \(both\)/.test(labOn.err) && (await user("ann@example.org")).memberships.length === 1, labOn.all);
  await call("PUT", "/admin/tenants/lab/identity", ADMIN, { issuer: "https://idp.example/realms/lab", clientId: "lab" });

  const first = await run(["--promote", "pea:pat@example.org"]);
  check("with an admin named for pea the copy runs", first.code === 0 && /7 user\(s\): 6 created, 1 replaced; 1 workspace setting\(s\); custom roles: 1 made, 0 brought up to date, 1 removed/.test(first.out), first.all);
  const annNow = await user("ann@example.org");
  check("a person keeps the workspace only webx-control knows, and its custom role is left alone", annNow.memberships.some((m) => m.tenantKey === "lab" && m.customRole === "lab-role") && /ann@example\.org: keeps lab/.test(first.out) && (await roles()).some((r) => r.tenantKey === "lab" && r.roleKey === "lab-role"), JSON.stringify(annNow));
  const ann = await user("ann@example.org"), bob = await user("bob@example.org"), sue = await user("sue@example.org"), rootU = await user("root@example.org");
  check("base roles from Strapi's, the custom role from the assignment", ann.memberships[0].role === "editor" && ann.memberships[0].customRole === "reviewer" && bob.memberships[0].role === "editor" && bob.memberships[0].customRole === null && sue.memberships[0].role === "admin", JSON.stringify([ann, bob, sue]));
  check("a super admin on no tenant is one here", rootU.superAdmin === true && rootU.memberships.length === 0);
  const zed = await user("zed@example.org"), olu = await user("olu@example.org"), pat = await user("pat@example.org");
  check("blocked is disabled, an unknown Strapi role is a viewer, the promoted member is pea's admin", zed.disabled === true && zed.memberships[0].role === "author" && olu.memberships[0].role === "viewer" && pat.memberships[0].role === "admin", JSON.stringify([zed, olu, pat]));
  const dga = (await call("GET", "/admin/tenants/dga/identity", ADMIN)).json.data;
  check("dga's sign-in settings: legacy, its provider and client, the secret held, MFA required since when Studio said", dga.mode === "legacy" && dga.issuer === "https://idp.example/realms/dga" && dga.clientId === "studio-dga" && dga.hasClientSecret === true && dga.mfaRequired === true && dga.mfaRequiredAt === "2026-10-01T00:00:00.000Z" && dga.allowJit === false, JSON.stringify(dga));
  check("pea, with nothing to carry, has no settings", (await call("GET", "/admin/tenants/pea/identity", ADMIN)).status === 404);
  const rs = (await roles()).filter((r) => r.tenantKey !== "lab");
  check("custom roles are Strapi's: the same id, key, name and permissions, and the stale one gone", rs.length === 1 && rs[0].documentId === "crole00000000000000000001" && rs[0].roleKey === "reviewer" && rs[0].permissions["api::faq.faq"].update === true && rs[0].createdAt === "2026-01-01T00:00:00.000Z", JSON.stringify(rs));

  // a second run brings everything up to date and adds nothing
  strapi.roles[0].name = "Reviewer (renamed)";
  strapi.users[1].isActive = false;
  const second = await run(["--promote", "pea:pat@example.org"]);
  check("run again: users replaced, custom roles brought up to date", second.code === 0 && /7 user\(s\): 0 created, 7 replaced; 1 workspace setting\(s\); custom roles: 0 made, 1 brought up to date, 0 removed/.test(second.out) && (await roles()).find((r) => r.tenantKey === "dga").name === "Reviewer (renamed)" && (await user("bob@example.org")).disabled === true, second.all);

  // something control would refuse stops the dry run too, so a real run never stops half-way after removing things
  strapi.tenants.push({ key: "department-of-something-very-long-name", adminEmails: ["zoe@example.org"] });
  strapi.users.push({ email: "zoe@example.org", isActive: true, roles: [role.sup] });
  const tooLong = await run(["--promote", "pea:pat@example.org", "--dry-run"]);
  check("a workspace key control does not take stops the dry run", tooLong.code === 1 && /workspace key "department-of-something-very-long-name" is not one webx-control accepts/.test(tooLong.err), tooLong.all);
  strapi.tenants.pop();
  strapi.users.pop();

  // the secret went from Studio's key to control's: once dga switches, the broker reads it as it was
  await call("PUT", "/admin/tenants/dga/identity", ADMIN, { mode: "both", issuer: "https://idp.example/realms/dga", clientId: "studio-dga" });
  const settings = await call("GET", "/internal/tenants/dga/identity", AUTH);
  check("once dga switches the broker reads the client secret Studio had", settings.status === 200 && settings.json.data.clientSecret === "dga-client-secret", JSON.stringify(settings.json));
  const after = await run(["--promote", "pea:pat@example.org"]);
  check("and the copy refuses to run over a workspace that signs in through webx-control", after.code === 1 && /already signs in through webx-control: dga \(both\)/.test(after.err) && (await call("GET", "/admin/tenants/dga/identity", ADMIN)).json.data.mode === "both", after.all);
  check("each change the copy made is in control's audit table", (await call("GET", `/internal/audit?pageSize=100&filter=${encodeURIComponent("action:eq:user_created")}`, SERVICE)).json.data.length === 7);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  server.kill("SIGTERM");
  await stopped;
  fake.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control users migration: all checks passed");
process.exit(failures ? 1 : 0);
