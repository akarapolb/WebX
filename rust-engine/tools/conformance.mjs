#!/usr/bin/env node
// Runs Studio's engine conformance suite (webx-studio/tests/conformance)
// against the Rust engine's write API, through the real adapter
// (webx-studio/lib/cms/rust.ts): import snapshot/snapshot.json into a
// throwaway database, mint a token for two tenants, start the engine, run the
// suite, stop. Needs a release build and `npm ci` in webx-studio.
//
//   node tools/conformance.mjs [--port 1392] [--main dga] [--other pea]
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const studio = resolve(root, "..", "webx-studio");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1392");
const MAIN = arg("main", "dga");
const OTHER = arg("other", "pea");
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-read-engine.exe" : "webx-read-engine");
if (!existsSync(exe)) throw new Error(`no engine binary at ${exe}: cargo build --release first`);

const dir = mkdtempSync(join(tmpdir(), "webx-conf-"));
const db = join(dir, "engine.db");
const sh = (args) => {
  const r = spawnSync(exe, args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
let engine;
let code = 1;
try {
  sh(["import", "--snapshot", "snapshot/snapshot.json", "--db", db]);
  const main = sh(["token", "--db", db, "--tenant", MAIN]);
  const other = sh(["token", "--db", db, "--tenant", OTHER]);
  engine = spawn(exe, ["--port", PORT, "--db", db], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  engine.done = new Promise((ok) => engine.on("exit", ok));
  for (let n = 0; ; n++) {
    try { if ((await fetch(`http://localhost:${PORT}/_health`)).ok) break; } catch {}
    if (n > 100) throw new Error("engine did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
  const r = spawnSync(process.execPath, ["--import", "./tests/setup/register.mjs", "--import", "tsx", "--test", "tests/conformance/rust.conformance.test.ts"], {
    cwd: studio,
    stdio: "inherit",
    env: { ...process.env, CONFORMANCE_RUST_URL: `http://localhost:${PORT}`, CONFORMANCE_RUST_TOKEN: main, CONFORMANCE_RUST_OTHER_TOKEN: other, CONFORMANCE_RUST_TENANT: MAIN },
  });
  code = r.status ?? 1;
} catch (e) {
  console.error(e);
} finally {
  if (engine) { engine.kill("SIGTERM"); await engine.done; }
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
