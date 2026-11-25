#!/usr/bin/env node
// C5, the visitors' routes (decision D12): the real webx-control binary, over HTTP, called the way a visitor's
// browser calls it. A cookie choice is logged for a registered workspace, an unknown one is filed under the
// first tenant (or refused with --strict-tenants), bad bodies are refused, an address that logs too much is
// slowed, and what was logged can be read back by the control plane's records API.
//
//   node tools/visitors-test.mjs [--port 1407]
//
// Needs the release build.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1407");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "visitors-admin-token", SERVICE = "visitors-service-token";
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

const dir = mkdtempSync(join(tmpdir(), "webx-visitors-"));
const db = join(dir, "control.db");
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const call = async (method, path, { token, body, headers } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(headers || {}) }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
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
const consent = { data: { consentId: "c-1", action: "accept_all", categories: { necessary: true, analytics: true, marketing: false }, language: "th", path: "/pea", userAgent: "Mozilla/5.0" } };
const logs = async (extra = "") => (await call("GET", `/internal/records/consent-log?pageSize=100${extra}`, { token: SERVICE })).json;

try {
  await up();
  for (const key of ["dga", "pea"]) await call("PUT", `/admin/tenants/${key}`, { token: ADMIN, body: { engine: "strapi", publicTemplate: "gov-portal" } });

  const a = await call("POST", "/api/consent-logs?tenant=pea", { body: consent, headers: { "x-forwarded-for": "10.0.0.1" } });
  check("a visitor's cookie choice is logged without signing in: 201", a.status === 201 && typeof a.json.data.documentId === "string", JSON.stringify(a));
  const stored = (await call("GET", `/internal/records/consent-log/${a.json.data.documentId}`, { token: SERVICE })).json.data;
  check("it is stored as given, for the workspace in the URL", stored.tenantKey === "pea" && stored.consentId === "c-1" && stored.action === "accept_all" && stored.categories.analytics === true && stored.path === "/pea" && stored.createdAt, JSON.stringify(stored));

  const u = await call("POST", "/api/consent-logs?tenant=nobody", { body: consent, headers: { "x-forwarded-for": "10.0.0.2" } });
  const filed = (await call("GET", `/internal/records/consent-log/${u.json.data.documentId}`, { token: SERVICE })).json.data;
  check("an unregistered tenant is filed under the first one, as Strapi does", u.status === 201 && filed.tenantKey === "dga", JSON.stringify(filed));
  check("no tenant named: the first one too", (await call("POST", "/api/consent-logs", { body: consent, headers: { "x-forwarded-for": "10.0.0.2" } })).status === 201);

  const long = "x".repeat(3000);
  const c = await call("POST", "/api/consent-logs?tenant=dga", { body: { data: { action: "custom", path: long, userAgent: long, injected: "no" } }, headers: { "x-forwarded-for": "10.0.0.3" } });
  const cut = (await call("GET", `/internal/records/consent-log/${c.json.data.documentId}`, { token: SERVICE })).json.data;
  check("long text is cut and unknown fields are dropped", cut.path.length === 512 && cut.userAgent.length === 512 && cut.injected === undefined, JSON.stringify(cut).slice(0, 200));

  check("a body that is not JSON: 400", (await call("POST", "/api/consent-logs?tenant=dga", { body: "not json", headers: { "x-forwarded-for": "10.0.0.4" } })).status === 400);
  check("a choice without an action: 400", (await call("POST", "/api/consent-logs?tenant=dga", { body: { data: { path: "/" } }, headers: { "x-forwarded-for": "10.0.0.4" } })).status === 400);
  check("categories that are not an object: 400", (await call("POST", "/api/consent-logs?tenant=dga", { body: { data: { action: "x", categories: [1] } }, headers: { "x-forwarded-for": "10.0.0.4" } })).status === 400);
  const big = await call("POST", "/api/consent-logs?tenant=dga", { body: { data: { action: "x", categories: { k: "y".repeat(40_000) } } }, headers: { "x-forwarded-for": "10.0.0.4" } });
  check("a body past 16 KB is refused: 413", big.status === 413, String(big.status));

  // one address logging too much is slowed; others are not
  let limited = 0;
  for (let n = 0; n < 40; n++) if ((await call("POST", "/api/consent-logs?tenant=dga", { body: consent, headers: { "x-forwarded-for": "10.9.9.9" } })).status === 429) limited++;
  check("an address that logs 40 times in a minute is rate-limited after 30: 429", limited === 10, `limited ${limited}`);
  check("another address is not affected", (await call("POST", "/api/consent-logs?tenant=dga", { body: consent, headers: { "x-forwarded-for": "10.9.9.8" } })).status === 201);

  // the visitor's route cannot read or change anything, and the records API still needs the service token
  check("the public route is write-only: a GET is not served", (await call("GET", "/api/consent-logs?tenant=pea")).status !== 200);
  check("reading the log needs the service token: 401", (await call("GET", "/internal/records/consent-log")).status === 401);
  const mine = await logs(`&filter=${encodeURIComponent("tenantKey:eq:pea")}`);
  check("the control plane lists a workspace's log by tenantKey", mine.meta.pagination.total === 1 && mine.data[0].consentId === "c-1", JSON.stringify(mine).slice(0, 200));

  // the same log survives a restart, and --strict-tenants refuses an unknown workspace
  await down();
  await up(["--strict-tenants"]);
  check("the log is still there after a restart", (await logs()).meta.pagination.total >= 4);
  check("with --strict-tenants an unknown workspace is refused: 404", (await call("POST", "/api/consent-logs?tenant=nobody", { body: consent, headers: { "x-forwarded-for": "10.0.1.1" } })).status === 404);
  check("a registered one is still accepted", (await call("POST", "/api/consent-logs?tenant=dga", { body: consent, headers: { "x-forwarded-for": "10.0.1.1" } })).status === 201);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (server) { try { await down(); } catch {} }
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control visitors: all checks passed");
process.exit(failures ? 1 : 0);
