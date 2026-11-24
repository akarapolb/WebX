#!/usr/bin/env node
// C4, identity: the real webx-control binary, over HTTP. Users and memberships
// through the admin API, tokens from the internal API, and the token checked the
// way an engine would: with Node's own crypto and the public key from
// /.well-known/jwks.json, not with this service's code.
//
//   node tools/identity-test.mjs [--port 1404]
//
// Needs the release build.
import { spawn } from "node:child_process";
import { createPublicKey, verify } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1404");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "identity-admin-token", SERVICE = "identity-service-token";
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

const dir = mkdtempSync(join(tmpdir(), "webx-identity-"));
const db = join(dir, "control.db");
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const call = async (method, path, token, body) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
};
let server;
async function up(args = []) {
  server = spawn(exe, ["--port", PORT, "--db", db, ...args], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_CONTROL_SERVICE_TOKEN: SERVICE }, stdio: ["ignore", "ignore", "inherit"] });
  server.done = new Promise((ok) => server.on("exit", ok));
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) return; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
}
const down = async () => { server.kill("SIGTERM"); await server.done; };
const b64 = (s) => Buffer.from(s, "base64url");

/** what an engine does: fetch the key set, check the signature and expiry, read the claims */
async function engineVerifies(token) {
  const jwk = (await (await fetch(`${BASE}/.well-known/jwks.json`)).json()).keys[0];
  const [h, c, s] = token.split(".");
  const header = JSON.parse(b64(h).toString());
  if (header.alg !== "EdDSA" || header.kid !== jwk.kid) return null;
  const ok = verify(null, Buffer.from(`${h}.${c}`), createPublicKey({ key: jwk, format: "jwk" }), b64(s));
  const claims = JSON.parse(b64(c).toString());
  return ok && claims.exp > Date.now() / 1000 ? claims : null;
}

try {
  await up(["--token-ttl", "2"]);
  const put = (email, body) => call("PUT", `/admin/users/${encodeURIComponent(email)}`, ADMIN, body);
  check("no admin token: 401", (await call("GET", "/admin/users")).status === 401);
  const made = await put("Ann@Example.org", { name: "Ann", memberships: [{ tenantKey: "dga", role: "editor" }, { tenantKey: "pea", role: "viewer" }] });
  check("create a user: 201, lowercase email, memberships back", made.status === 201 && made.json.data.email === "ann@example.org" && made.json.data.memberships.length === 2);
  check("replace: 200", (await put("ann@example.org", { name: "Ann", memberships: [{ tenantKey: "dga", role: "editor" }, { tenantKey: "pea", role: "viewer" }] })).status === 200);
  check("a bad body is refused: 400", (await put("ann@example.org", { memberships: [{ tenantKey: "BAD", role: "x" }] })).status === 400 && (await put("nope", { memberships: [] })).status === 400);
  check("list and read", (await call("GET", "/admin/users", ADMIN)).json.data.length === 1 && (await call("GET", "/admin/users/ann@example.org", ADMIN)).json.data.name === "Ann");

  check("the token API needs the service token, not the admin token", (await call("POST", "/internal/token", ADMIN, { email: "ann@example.org" })).status === 401);
  const tok = await call("POST", "/internal/token", SERVICE, { email: "ann@example.org", tenantKey: "dga" });
  check("a token for one workspace", tok.status === 200 && tok.json.data.token.split(".").length === 3);
  const claims = await engineVerifies(tok.json.data.token);
  check("an engine verifies it with the published key and reads the workspace and role", claims && claims.sub === "ann@example.org" && claims.tenants.length === 1 && claims.tenants[0].key === "dga" && claims.tenants[0].role === "editor");
  check("a token for a workspace the user is not in: 403", (await call("POST", "/internal/token", SERVICE, { email: "ann@example.org", tenantKey: "orst" })).status === 403);
  check("a token for an unknown user: 403", (await call("POST", "/internal/token", SERVICE, { email: "nobody@example.org" })).status === 403);
  const all = (await call("POST", "/internal/token", SERVICE, { email: "ann@example.org" })).json.data.token;
  check("without a workspace the token carries all of theirs", (await engineVerifies(all)).tenants.length === 2);

  const mine = await call("GET", "/api/auth/me", all);
  check("/api/auth/me answers for a valid token", mine.status === 200 && mine.json.data.email === "ann@example.org" && mine.json.data.tenants.length === 2);
  check("no token, a bad token and a tampered token: 401", (await call("GET", "/api/auth/me")).status === 401 && (await call("GET", "/api/auth/me", "a.b.c")).status === 401
    && (await call("GET", "/api/auth/me", all.slice(0, -4) + "AAAA")).status === 401);

  await put("ann@example.org", { name: "Ann", disabled: true, memberships: [{ tenantKey: "dga", role: "editor" }] });
  check("disabling a user cuts off a live token at once", (await call("GET", "/api/auth/me", all)).status === 401);
  check("and no new token is issued", (await call("POST", "/internal/token", SERVICE, { email: "ann@example.org" })).status === 403);
  await put("ann@example.org", { name: "Ann", memberships: [{ tenantKey: "dga", role: "editor" }] });

  const short = (await call("POST", "/internal/token", SERVICE, { email: "ann@example.org" })).json.data.token;
  check("a token works before it expires", (await call("GET", "/api/auth/me", short)).status === 200);
  await new Promise((r) => setTimeout(r, 2500));
  check("and is refused after (--token-ttl 2)", (await call("GET", "/api/auth/me", short)).status === 401);

  const kidBefore = (await (await fetch(`${BASE}/.well-known/jwks.json`)).json()).keys[0].kid;
  await down();
  await up();
  const kidAfter = (await (await fetch(`${BASE}/.well-known/jwks.json`)).json()).keys[0].kid;
  check("the signing key survives a restart, so old tokens still verify", kidBefore === kidAfter && (await call("GET", "/api/auth/me", all)).status === 401 /* disabled earlier, not a key problem: */ && (await call("GET", "/admin/users/ann@example.org", ADMIN)).json.data.memberships.length === 1);
  const fresh = (await call("POST", "/internal/token", SERVICE, { email: "ann@example.org" })).json.data.token;
  await down();
  await up();
  check("a token issued before a restart verifies after it", (await call("GET", "/api/auth/me", fresh)).status === 200);
  check("delete a user", (await call("DELETE", "/admin/users/ann@example.org", ADMIN)).status === 200 && (await call("GET", "/api/auth/me", fresh)).status === 401);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (server) { try { await down(); } catch {} }
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control identity: all checks passed");
process.exit(failures ? 1 : 0);
