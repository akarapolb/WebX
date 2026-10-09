// Builds the static public site and publishes it to a shared volume.
//
//   - builds once at start-up, then again whenever Studio calls
//     POST /rebuild (it does this after a Publish — see
//     webx-studio/lib/publicSiteBuild.ts, PUBLIC_SITE_REBUILD_URL)
//   - bursts collapse into one build, and never two at once — same
//     debounce/single-flight behaviour as the in-process builder this
//     replaces inside Docker
//   - the result is written to a new release directory and made live by
//     swapping a symlink, so the web server never serves a half-written site
//     and a failed build leaves the previous site exactly as it was
//
// Plain Node, no dependencies, so it adds nothing to the image.
import http from "node:http";
import { spawn } from "node:child_process";
import { cp, mkdir, readdir, rename, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.BUILDER_PORT || 8099);
const SITE_DIR = process.env.SITE_DIR || "/site"; // the shared volume
const SECRET = process.env.PUBLIC_SITE_REBUILD_SECRET || "";
const DEBOUNCE_MS = Number(process.env.PUBLIC_SITE_REBUILD_DEBOUNCE_MS || 5_000);
const BUILD_TIMEOUT_MS = Number(process.env.BUILD_TIMEOUT_MS || 10 * 60_000);
const KEEP_RELEASES = 3;
// One-shot mode (scripts/package-standalone.mjs): build, write the result to
// SITE_DIR/releases/<name> and exit. No server, no symlink, nothing pruned —
// the caller owns the directory (it is a bind mount, where symlinks are not
// reliable on Windows hosts).
const ONCE = process.env.BUILD_ONCE === "1";

let building = false;
let pending = false;
let timer = null;
let lastBuiltAt = null;
let lastError = null;
let lastRelease = null;

function log(...a) { console.log(new Date().toISOString(), "[site-builder]", ...a); }

// Self-host the Google fonts the theme picked (scripts/prepare-theme-fonts.mjs).
// It exits 0 whatever happens — a font problem must never block a publish.
function prepareFonts() {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/prepare-theme-fonts.mjs"], { cwd: "/app", env: process.env, stdio: "inherit" });
    child.on("error", (e) => { log("font step could not start:", String(e?.message || e)); resolve(); });
    child.on("exit", () => resolve());
  });
}

async function runNextBuild() {
  // Next keeps fetched data in .next/cache and reuses it ACROSS builds, so
  // without clearing it a rebuild can republish the previous build's stale
  // content (found live: an edited tenant name kept its old value). The cache
  // is only needed within one build, to dedupe repeated fetches.
  await rm("/app/.next", { recursive: true, force: true });
  await prepareFonts();
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["next", "build"], { cwd: "/app", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (d) => { process.stdout.write(d); tail = (tail + d.toString()).slice(-2000); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const to = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("build timed out")); }, BUILD_TIMEOUT_MS);
    child.on("error", (e) => { clearTimeout(to); reject(e); });
    child.on("exit", (code) => {
      clearTimeout(to);
      code === 0 ? resolve() : reject(new Error("next build exited " + code + "\n" + tail));
    });
  });
}

async function publish() {
  const out = "/app/out";
  if (!existsSync(path.join(out, "index.html"))) throw new Error("build produced no out/index.html");
  const releases = path.join(SITE_DIR, "releases");
  await mkdir(releases, { recursive: true });
  const name = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(releases, name);
  await cp(out, dest, { recursive: true });
  lastRelease = name;
  if (ONCE) return;

  // Atomic swap: build the new link beside the old one, then rename over it.
  const tmp = path.join(SITE_DIR, ".current-next");
  await rm(tmp, { force: true });
  await symlink(path.join("releases", name), tmp);
  await rename(tmp, path.join(SITE_DIR, "current"));
  lastRelease = name;

  const all = (await readdir(releases)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_RELEASES))) {
    await rm(path.join(releases, old), { recursive: true, force: true });
  }
}

async function runBuild() {
  building = true;
  log("build started");
  try {
    await runNextBuild();
    await publish();
    lastBuiltAt = new Date().toISOString();
    lastError = null;
    log("build published:", lastRelease);
  } catch (e) {
    lastError = String(e?.message || e).slice(0, 2000);
    log("build FAILED — previous site left in place:", lastError.split("\n")[0]);
  } finally {
    building = false;
    if (pending) { pending = false; schedule(); }
  }
}

function schedule() {
  if (building) { pending = true; return; }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void runBuild(); }, DEBOUNCE_MS);
}

const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

const server = http.createServer((req, res) => {
  const url = (req.url || "").split("?")[0];
  if (req.method === "GET" && url === "/health") return json(res, 200, { ok: true });
  if (req.method === "GET" && url === "/status") return json(res, 200, { building, lastBuiltAt, lastError, release: lastRelease });
  if (req.method === "POST" && url === "/rebuild") {
    // Refuse when no secret is configured rather than run open: this endpoint
    // makes the container hit Strapi/WordPress and burn CPU on demand.
    if (!SECRET || req.headers["x-rebuild-secret"] !== SECRET) return json(res, 403, { error: "forbidden" });
    schedule();
    return json(res, 202, { started: true });
  }
  json(res, 404, { error: "not found" });
});

if (ONCE) {
  await runBuild();
  process.exit(lastError ? 1 : 0);
} else {
  server.listen(PORT, () => log("listening on", PORT));
  void runBuild();
}
