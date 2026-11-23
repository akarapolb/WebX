#!/usr/bin/env node
// C2's "test that decides done": webx-control answers the tenant routes exactly
// as the engine public-site reads them from today. Compares, for the tenant
// list and for /resolve of every tenant (th and en), the reference answer (a
// live Strapi, or any engine serving the same data) with webx-control's, as
// JSON. Also checks the admin API: token needed, create, change, delete, and
// that the public answers follow.
//
//   node tools/parity-test.mjs --reference http://localhost:1337 [--port 1401]
//
// Needs the release build. It imports the reference's tenants into a throwaway
// database through a snapshot-shaped file built from the reference's answers.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const REF = arg("reference", process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const PORT = arg("port", "1401");
const BASE = `http://localhost:${PORT}`;
const TOKEN = "parity-test-admin-token";
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

const dir = mkdtempSync(join(tmpdir(), "webx-control-"));
const db = join(dir, "control.db");
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const get = async (base, path, headers = {}) => {
  const r = await fetch(base + path, { headers });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
};
const send = async (method, path, token, body) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
};
// key order is not part of the contract for this comparison, content is
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

let server;
try {
  // the reference's own answers become a snapshot-shaped file for `import`
  const keys = await get(REF, "/api/tenants/keys");
  if (keys.status !== 200) throw new Error(`reference answered ${keys.status} for /api/tenants/keys`);
  const resolveBy = {};
  for (const t of keys.json.data) resolveBy[t.key] = (await get(REF, `/api/tenants/resolve?tenant=${t.key}&locale=th`)).json;
  const snap = join(dir, "snapshot.json");
  writeFileSync(snap, JSON.stringify({ special: { "tenants/keys": keys.json, "tenants/resolve": resolveBy } }));
  const imp = spawnSync(exe, ["import", "--snapshot", snap, "--db", db], { encoding: "utf8" });
  if (imp.status !== 0) throw new Error(imp.stderr);

  server = spawn(exe, ["--port", PORT, "--db", db], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: TOKEN }, stdio: ["ignore", "ignore", "inherit"] });
  server.done = new Promise((ok) => server.on("exit", ok));
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) break; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }

  // --- parity with the reference
  const mine = await get(BASE, "/api/tenants/keys");
  check("keys: same answer, same order", mine.status === 200 && JSON.stringify(mine.json) === JSON.stringify(keys.json), JSON.stringify(mine.json));
  for (const t of keys.json.data) {
    for (const locale of ["th", "en"]) {
      const a = await get(REF, `/api/tenants/resolve?tenant=${t.key}&locale=${locale}`);
      const b = await get(BASE, `/api/tenants/resolve?tenant=${t.key}&locale=${locale}`);
      check(`resolve ${t.key} ${locale}: same status and JSON`, a.status === b.status && canon(a.json) === canon(b.json), `${a.status}/${b.status}`);
    }
  }
  check("resolve with no tenant: the first tenant", canon((await get(BASE, "/api/tenants/resolve")).json) === canon(resolveBy[keys.json.data[0].key]));
  const refUnknown = await get(REF, "/api/tenants/resolve?tenant=nosuch&locale=th");
  const myUnknown = await get(BASE, "/api/tenants/resolve?tenant=nosuch&locale=th");
  check("resolve of an unknown tenant: same as the reference (today: the first tenant's answer)", refUnknown.status === myUnknown.status && canon(refUnknown.json) === canon(myUnknown.json), `${refUnknown.status}/${myUnknown.status}`);

  // --- admin API
  check("admin without a token: 401", (await send("GET", "/admin/tenants")).status === 401);
  check("admin with a wrong token: 401", (await send("GET", "/admin/tenants", "nope")).status === 401);
  const list = await send("GET", "/admin/tenants", TOKEN);
  check("admin list shows every tenant", list.status === 200 && list.json.data.length === keys.json.data.length);
  const body = { engine: "rust", publicTemplate: "dgahub", engineUrl: "http://localhost:1338", resolve: { key: "newco", name: "New Co" } };
  const made = await send("PUT", "/admin/tenants/newco", TOKEN, body);
  check("admin creates a tenant: 201", made.status === 201 && made.json.data.engine === "rust", JSON.stringify(made));
  check("it appears in the public list, last", (await get(BASE, "/api/tenants/keys")).json.data.at(-1)?.key === "newco");
  check("and resolves", (await get(BASE, "/api/tenants/resolve?tenant=newco")).json.data?.name === "New Co");
  const changed = await send("PUT", "/admin/tenants/newco", TOKEN, { ...body, resolve: { key: "newco", name: "Renamed" } });
  check("admin changes it: 200", changed.status === 200 && (await get(BASE, "/api/tenants/resolve?tenant=newco")).json.data.name === "Renamed");
  check("the first tenant is still the default", canon((await get(BASE, "/api/tenants/resolve")).json) === canon(resolveBy[keys.json.data[0].key]));
  check("a bad key is refused: 400", (await send("PUT", "/admin/tenants/Bad%20Key", TOKEN, body)).status === 400);
  check("an unknown engine is refused: 400", (await send("PUT", "/admin/tenants/okco", TOKEN, { ...body, engine: "mysql" })).status === 400);
  check("admin deletes it: 200, then 404", (await send("DELETE", "/admin/tenants/newco", TOKEN)).status === 200 && (await send("DELETE", "/admin/tenants/newco", TOKEN)).status === 404);
  check("gone from the public list", !(await get(BASE, "/api/tenants/keys")).json.data.some((t) => t.key === "newco"));

  // --- strict mode (decision D9): an unknown key is a 404, never another tenant's data
  const strict = spawn(exe, ["--port", String(Number(PORT) + 1), "--db", db, "--strict-tenants"], { stdio: ["ignore", "ignore", "inherit"] });
  strict.done = new Promise((ok) => strict.on("exit", ok));
  for (let n = 0; ; n++) { try { if ((await fetch(`http://localhost:${Number(PORT) + 1}/_health`)).ok) break; } catch {} if (n > 100) throw new Error("strict instance failed"); await new Promise((r) => setTimeout(r, 100)); }
  const sKnown = await get(`http://localhost:${Number(PORT) + 1}`, `/api/tenants/resolve?tenant=${keys.json.data[0].key}`);
  const sUnknown = await get(`http://localhost:${Number(PORT) + 1}`, "/api/tenants/resolve?tenant=nosuch");
  check("--strict-tenants: a known tenant still resolves, an unknown key is 404", sKnown.status === 200 && sUnknown.status === 404, `${sKnown.status}/${sUnknown.status}`);
  strict.kill("SIGTERM"); await strict.done;

  // --- the registry is durable
  server.kill("SIGTERM"); await server.done;
  server = spawn(exe, ["--port", PORT, "--db", db], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: TOKEN }, stdio: ["ignore", "ignore", "inherit"] });
  server.done = new Promise((ok) => server.on("exit", ok));
  for (let n = 0; ; n++) { try { if ((await fetch(`${BASE}/_health`)).ok) break; } catch {} if (n > 100) throw new Error("restart failed"); await new Promise((r) => setTimeout(r, 100)); }
  check("the list is the same after a restart", JSON.stringify((await get(BASE, "/api/tenants/keys")).json) === JSON.stringify(keys.json));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (server) { server.kill("SIGTERM"); await server.done; }
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control: all checks passed");
process.exit(failures ? 1 : 0);
