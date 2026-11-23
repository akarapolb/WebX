#!/usr/bin/env node
// C2's build test: a public-site build that reads the tenant list and tenant
// identity from webx-control must be identical to one that reads them from the
// content engine. Both builds read content from the same engine (the Rust
// read engine serving snapshot/snapshot.json, a stand-in for Strapi that
// rust-engine's own build test proves identical); the second also sets
// WEBX_CONTROL_URL. Then rust-engine/tools/build-diff.mjs compares the two.
//
//   node tools/build-test.mjs [--port 1338] [--control-port 1400] [--no-check-export]
//
// Needs both release builds (webx-control and rust-engine) and
// rust-engine/snapshot/snapshot.json (rust-engine/tools/export-snapshot.mjs).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const control = resolve(here, "..");
const engineDir = resolve(control, "..", "rust-engine");
const site = resolve(control, "..", "public-site");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1338");
const CPORT = arg("control-port", "1400");
const NO_CHECK = process.argv.includes("--no-check-export");
const bin = (dir, name) => join(dir, "target", "release", process.platform === "win32" ? `${name}.exe` : name);
const engineExe = bin(engineDir, "webx-read-engine");
const controlExe = bin(control, "webx-control");
const snapshot = join(engineDir, "snapshot", "snapshot.json");
for (const f of [engineExe, controlExe, snapshot]) if (!existsSync(f)) throw new Error(`missing ${f}`);

const log = (m) => console.log(`\n[control build-test] ${m}`);
const start = (cmd, args, opts = {}) => {
  const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"], ...opts });
  p.done = new Promise((ok) => p.on("exit", ok));
  return p;
};
const stop = async (p) => { p.kill("SIGTERM"); await p.done; };
const run = (cmd, args, opts = {}) => new Promise((ok, fail) => {
  const p = spawn(cmd, args, { stdio: "inherit", shell: cmd === "npm" && process.platform === "win32", ...opts });
  p.on("exit", (c) => (c === 0 ? ok() : fail(new Error(`${cmd} ${args.join(" ")} exited ${c}`))));
});
async function waitFor(url, what) {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).status < 500) return; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  throw new Error(`${what} did not answer on ${url}`);
}
const build = async (dist, extraEnv) => {
  rmSync(join(site, dist), { recursive: true, force: true });
  rmSync(join(site, ".next", "cache", "fetch-cache"), { recursive: true, force: true });
  const opts = { cwd: site, env: { ...process.env, STRAPI_URL: `http://localhost:${PORT}`, NEXT_DIST_DIR: dist, ...extraEnv } };
  if (!NO_CHECK) return run("npm", ["run", "build"], opts);
  await run("npm", ["exec", "--", "next", "build"], opts);
  return run(process.execPath, [join(site, "scripts", "set-html-lang.mjs")], opts);
};

const dir = mkdtempSync(join(tmpdir(), "webx-control-build-"));
let engine, ctl;
try {
  const db = join(dir, "control.db");
  const imp = spawnSync(controlExe, ["import", "--snapshot", snapshot, "--db", db], { encoding: "utf8" });
  if (imp.status !== 0) throw new Error(imp.stderr);
  engine = start(engineExe, ["--port", PORT, "--snapshot", snapshot, "--uploads", join(dir, "uploads")], { cwd: engineDir });
  ctl = start(controlExe, ["--port", CPORT, "--db", db]);
  await waitFor(`http://localhost:${PORT}/_health`, "engine");
  await waitFor(`http://localhost:${CPORT}/_health`, "webx-control");

  log("1/3 build, tenants from the engine");
  await build(".next-ctl-a", {});
  log("2/3 build, tenants from webx-control");
  await build(".next-ctl-b", { WEBX_CONTROL_URL: `http://localhost:${CPORT}` });
  const served = (await (await fetch(`http://localhost:${CPORT}/_health`)).json()).served;
  // the first build never asked webx-control; the second must have
  if (!(served > 0)) throw new Error("webx-control answered no tenant request: the second build did not use it");
  console.log(`[control build-test] webx-control answered ${served} tenant request(s) during the builds`);
  log("3/3 build diff");
  await run(process.execPath, [join(engineDir, "tools", "build-diff.mjs"), join(site, ".next-ctl-a"), join(site, ".next-ctl-b")]);
  log("passed");
} catch (e) {
  console.error(`\n[control build-test] FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (ctl) await stop(ctl);
  if (engine) await stop(engine);
  rmSync(dir, { recursive: true, force: true });
}
