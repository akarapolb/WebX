#!/usr/bin/env node
// The whole "test that decides done" (rust-engine plan) in one command, the
// same locally and in CI (.github/workflows/rust-engine.yml). Needs a running
// Strapi with content and a built engine (cargo build --release).
//
//   node tools/build-test.mjs [--strapi http://localhost:1337] [--port 1338]
//
// 1. record: public-site build through tools/record-proxy.mjs (-> .next-ref,
//    fixtures/requests.json)
// 2. export the snapshot from Strapi
// 3. contract test: replay every recorded read against the engine
// 4. build public-site against the engine (-> .next-eng); public-site's own
//    check-export runs as part of `npm run build`
// 5. build-diff, for the whole site and per Strapi tenant
// Both builds use the same address (--port), so media URLs baked into pages
// match. Exit 1 on the first failing step.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const site = resolve(root, "..", "public-site");
const arg = (name, def) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : def;
};
const STRAPI = arg("strapi", process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const PORT = arg("port", "1338");
const LOCAL = `http://localhost:${PORT}`;
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-read-engine.exe" : "webx-read-engine");

const log = (m) => console.log(`\n[build-test] ${m}`);
function run(cmd, args, opts = {}) {
  return new Promise((ok, fail) => {
    // shell only for npm (npm.cmd on Windows); node's own path may contain spaces
    const p = spawn(cmd, args, { stdio: "inherit", shell: cmd === "npm" && process.platform === "win32", ...opts });
    p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}
function start(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"], ...opts });
  p.done = new Promise((ok) => p.on("exit", ok));
  return p;
}
async function waitFor(url, what) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).status < 500) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${what} did not answer on ${url}`);
}
async function stop(p) { p.kill("SIGTERM"); await p.done; }
// Next keeps its fetch cache in public-site/.next/cache whatever NEXT_DIST_DIR
// says, keyed by URL; both builds use the same URL, so without clearing it the
// second build would be served the first build's (Strapi's) answers.
const build = (dist) => {
  rmSync(join(site, dist), { recursive: true, force: true });
  rmSync(join(site, ".next", "cache", "fetch-cache"), { recursive: true, force: true });
  return run("npm", ["run", "build"], { cwd: site, env: { ...process.env, STRAPI_URL: LOCAL, NEXT_DIST_DIR: dist } });
};

try {
  if (!existsSync(exe)) throw new Error(`no engine binary at ${exe}: run cargo build --release first`);
  await waitFor(`${STRAPI}/api/tenants/keys`, "Strapi");

  log(`1/5 record: public-site build through the proxy (${LOCAL} -> ${STRAPI})`);
  const proxy = start(process.execPath, [join(here, "record-proxy.mjs"), "--port", PORT, "--target", STRAPI], { cwd: root });
  await waitFor(`${LOCAL}/_health`, "record proxy");
  await build(".next-ref");
  await fetch(`${LOCAL}/__save`);
  await stop(proxy);

  log("2/5 export the snapshot");
  await run(process.execPath, [join(here, "export-snapshot.mjs"), "--strapi", STRAPI], { cwd: root });

  log("3/5 contract test");
  // the engine listens one port up; the build reaches it through the proxy on
  // PORT, so its URLs match the reference build and its reads are recorded
  const ENGINE = `http://localhost:${Number(PORT) + 1}`;
  const engine = start(exe, ["--port", String(Number(PORT) + 1), "--snapshot", "snapshot/snapshot.json", "--uploads", "../strapi-cms/public/uploads"], { cwd: root });
  try {
    await waitFor(`${ENGINE}/_health`, "engine");
    await run(process.execPath, [join(here, "contract-test.mjs"), "--engine", ENGINE], { cwd: root });

    log("4/5 public-site build against the engine");
    const engProxy = start(process.execPath, [join(here, "record-proxy.mjs"), "--port", PORT, "--target", ENGINE, "--out", "fixtures/engine-requests.json"], { cwd: root });
    await waitFor(`${LOCAL}/_health`, "engine proxy");
    await build(".next-eng");
    await fetch(`${LOCAL}/__save`);
    await stop(engProxy);
    // the engine build must have read the engine, and read the same things
    const paths = (f) => JSON.parse(readFileSync(join(root, "fixtures", f), "utf8")).map((r) => r.path).sort();
    const want = paths("requests.json"), got = paths("engine-requests.json");
    if (JSON.stringify(want) !== JSON.stringify(got)) {
      const missing = want.filter((p) => !got.includes(p)), extra = got.filter((p) => !want.includes(p));
      throw new Error(`engine build read ${got.length} path(s), reference ${want.length}; missing ${missing.slice(0, 5).join(", ")}; extra ${extra.slice(0, 5).join(", ")}`);
    }
    console.log(`[build-test] engine build read the same ${got.length} path(s) as the reference build`);
  } finally { await stop(engine); }

  log("5/5 build diff");
  const ref = join(site, ".next-ref"), eng = join(site, ".next-eng");
  await run(process.execPath, [join(here, "build-diff.mjs"), ref, eng]);
  const keys = JSON.parse(readFileSync(join(root, "snapshot", "snapshot.json"), "utf8")).special["tenants/keys"].data;
  for (const t of keys.filter((k) => k.engine === "strapi")) {
    await run(process.execPath, [join(here, "build-diff.mjs"), ref, eng, "--only", t.key]);
  }
  log("passed");
} catch (e) {
  console.error(`\n[build-test] FAILED: ${e.message}`);
  process.exit(1);
}
