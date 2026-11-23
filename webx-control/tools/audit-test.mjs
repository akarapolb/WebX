#!/usr/bin/env node
// C3, audit log: the real webx-control binary, over HTTP, then Studio's own
// adapter tests (webx-studio/tests/audit-store.test.ts) against it.
//
//   node tools/audit-test.mjs [--port 1403]
//
// Needs the release build and `npm ci` in ../webx-studio.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const studio = resolve(root, "..", "webx-studio");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1403");
const BASE = `http://localhost:${PORT}`;
const SERVICE = "audit-test-service-token";
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

const dir = mkdtempSync(join(tmpdir(), "webx-audit-"));
const db = join(dir, "control.db");
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const call = async (method, path, token, body) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
};
let server;
async function up(env) {
  server = spawn(exe, ["--port", PORT, "--db", db], { env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "inherit"] });
  server.done = new Promise((ok) => server.on("exit", ok));
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) return; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
}
const down = async () => { server.kill("SIGTERM"); await server.done; };

try {
  await up({});
  check("without WEBX_CONTROL_SERVICE_TOKEN the internal API is off: 503", (await call("GET", "/internal/audit", SERVICE)).status === 503);
  await down();

  await up({ WEBX_CONTROL_SERVICE_TOKEN: SERVICE });
  check("no token: 401", (await call("GET", "/internal/audit")).status === 401);
  check("wrong token: 401", (await call("GET", "/internal/audit", "nope")).status === 401);
  check("the admin token does not open the internal API", (await call("GET", "/internal/audit", "admin-token")).status === 401);

  const made = await call("POST", "/internal/audit", SERVICE, { data: { action: "signup", contentType: "api::tenant.tenant", tenantKey: "dga", adminEmail: "a@x" } });
  check("create: 200 with an id, a documentId and timestamps", made.status === 200 && made.json.data.id && made.json.data.documentId?.length === 24 && made.json.data.createdAt && made.json.data.at);
  check("create without an action: 400", (await call("POST", "/internal/audit", SERVICE, { data: { tenantKey: "dga" } })).status === 400);
  check("unknown list parameter: 400", (await call("GET", "/internal/audit?bogus=1", SERVICE)).status === 400);
  check("unknown filter field: 400", (await call("GET", "/internal/audit?filter=nosuch:eq:1", SERVICE)).status === 400);
  check("there is no way to change or delete a row", (await call("PUT", `/internal/audit/${made.json.data.documentId}`, SERVICE, {})).status === 404 && (await call("DELETE", `/internal/audit/${made.json.data.documentId}`, SERVICE)).status === 404);

  const rows = [
    { documentId: "imported0000000000000001", action: "agent_run", tenantKey: "dga", at: "2026-10-01T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" },
    { documentId: "imported0000000000000002", action: "signup", tenantKey: "pea", at: "2026-10-02T00:00:00.000Z", createdAt: "2026-10-02T00:00:00.000Z" },
  ];
  const imp1 = await call("POST", "/internal/audit/import", SERVICE, rows);
  const imp2 = await call("POST", "/internal/audit/import", SERVICE, rows);
  check("import adds the rows", imp1.json.added === 2 && imp1.json.skipped === 0);
  check("importing again skips them: an import can be re-run", imp2.json.added === 0 && imp2.json.skipped === 2);
  const one = await call("GET", "/internal/audit/imported0000000000000001", SERVICE);
  check("an imported row keeps its id and time", one.status === 200 && one.json.data.createdAt === "2026-10-01T00:00:00.000Z");

  const q = (s) => call("GET", `/internal/audit${s}`, SERVICE);
  check("filter by tenant and action", (await q("?filter=tenantKey:eq:dga&filter=action:eq:agent_run")).json.meta.pagination.total === 1);
  check("newest first by default", (await q("")).json.data[0].action === "signup" && (await q("")).json.data[0].tenantKey === "dga");
  check("sort ascending", (await q("?sort=at:asc")).json.data[0].documentId === "imported0000000000000001");
  check("pagination reports the total", (await q("?pageSize=1&page=2")).json.meta.pagination.total === 3);

  // Studio's own adapter against this binary
  const r = spawnSync(process.execPath, ["--import", "./tests/setup/register.mjs", "--import", "tsx", "--test", "tests/audit-store.test.ts"], {
    cwd: studio, stdio: "inherit", env: { ...process.env, AUDIT_CONTROL_URL: BASE, AUDIT_CONTROL_TOKEN: SERVICE },
  });
  check("Studio's audit adapter tests pass against it", r.status === 0);

  // durable
  await down();
  await up({ WEBX_CONTROL_SERVICE_TOKEN: SERVICE });
  check("rows survive a restart", (await q("")).json.meta.pagination.total >= 3);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (server) { try { await down(); } catch {} }
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control audit: all checks passed");
process.exit(failures ? 1 : 0);
