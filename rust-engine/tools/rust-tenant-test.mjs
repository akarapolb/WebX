#!/usr/bin/env node
// R5: the first tenant that lives on the Rust engine. The hub tenant (`dgahub`,
// the `dgahub` public template) gets all its content through the engine's write
// API, nothing imported from Strapi: pages (Thai and English), an article and
// FAQs, created as drafts and published. It is registered in webx-control with
// engine "rust". A public-site build then reads the tenant list and identity
// from webx-control and the content from the Rust engine, and the pages must
// show what was written.
//
//   node tools/rust-tenant-test.mjs [--port 1338] [--control-port 1400]
//
// Needs both release builds (rust-engine and ../webx-control) and
// snapshot/snapshot.json (the other tenants' content; dgahub is not in it).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const controlDir = resolve(root, "..", "webx-control");
const site = resolve(root, "..", "public-site");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1338");
const CPORT = arg("control-port", "1400");
const bin = (dir, name) => join(dir, "target", "release", process.platform === "win32" ? `${name}.exe` : name);
const engineExe = bin(root, "webx-read-engine");
const controlExe = bin(controlDir, "webx-control");
const snapshotPath = join(root, "snapshot", "snapshot.json");
for (const f of [engineExe, controlExe, snapshotPath]) if (!existsSync(f)) throw new Error(`missing ${f}`);

const ENGINE = `http://localhost:${PORT}`;
const CONTROL = `http://localhost:${CPORT}`;
const ADMIN = "rust-tenant-test-admin";
const DIST = ".next-rust-tenant";
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const sh = (exe, args) => { const r = spawnSync(exe, args, { encoding: "utf8" }); if (r.status !== 0) throw new Error(`${args.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
const start = (cmd, args, opts = {}) => { const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "inherit"], ...opts }); p.done = new Promise((ok) => p.on("exit", ok)); return p; };
const stop = async (p) => { p.kill("SIGTERM"); await p.done; };
async function waitFor(url, what) {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).status < 500) return; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  throw new Error(`${what} did not answer on ${url}`);
}
const call = async (base, method, path, token, body) => {
  const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const htmlFiles = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? htmlFiles(p) : n.endsWith(".html") ? [p] : [];
});

const dir = mkdtempSync(join(tmpdir(), "webx-rust-tenant-"));
let engine, ctl;
try {
  const edb = join(dir, "engine.db"), cdb = join(dir, "control.db");
  sh(engineExe, ["import", "--snapshot", snapshotPath, "--db", edb]);
  const token = sh(engineExe, ["token", "--db", edb, "--tenant", "dgahub", "--label", "r5"]);
  sh(controlExe, ["import", "--snapshot", snapshotPath, "--db", cdb]);

  engine = start(engineExe, ["--port", PORT, "--db", edb, "--uploads", join(dir, "uploads")], { cwd: root });
  ctl = start(controlExe, ["--port", CPORT, "--db", cdb], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN } });
  await waitFor(`${ENGINE}/_health`, "engine");
  await waitFor(`${CONTROL}/_health`, "webx-control");

  // 1. register the tenant in the control plane as a Rust tenant
  const snap = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const dga = snap.special["tenants/resolve"].dga.data;
  const identity = { ...dga, key: "dgahub", name: "Rust hub (R5 test)", brand: { ...dga.brand, orgName: { th: "Rust hub (R5 test)", en: "Rust hub (R5 test)" } } };
  await call(CONTROL, "PUT", "/admin/tenants/dgahub", ADMIN, { engine: "rust", publicTemplate: "dgahub", engineUrl: ENGINE, resolve: identity });
  const keys = (await (await fetch(`${CONTROL}/api/tenants/keys`)).json()).data;
  check("the control plane lists dgahub as a rust tenant on the dgahub template", keys.some((t) => t.key === "dgahub" && t.engine === "rust" && t.publicTemplate === "dgahub"));

  // 2. its content, through the write API only
  const W = (method, path, body) => call(ENGINE, method, `/write/${path}`, token, body);
  const publish = (plural, id, locale) => W("POST", `${plural}/${id}/publish?locale=${locale}`);
  const text = {
    th: { hero: "ศูนย์กลางรัฐบาลดิจิทัล บนเครื่องยนต์ Rust", about: "เกี่ยวกับศูนย์นี้ เขียนผ่าน write API", faq: "คำถามทดสอบ R5", news: "ข่าวทดสอบ R5" },
    en: { hero: "Digital government hub on the Rust engine", about: "About this hub, written through the write API", faq: "R5 test question", news: "R5 test news" },
  };
  const page = async (slug, title, blocksFor) => {
    const c = await W("POST", "pages?locale=th", { data: { title, slug, blocks: blocksFor("th") } });
    const id = c.data.documentId;
    await W("PUT", `pages/${id}?locale=en`, { data: { title: `${title} (en)`, slug, blocks: blocksFor("en") } });
    await publish("pages", id, "th"); await publish("pages", id, "en");
  };
  await page("home-blocks", "Home", (l) => [{ __component: "block.hero", heading: text[l].hero, subheading: "R5" }]);
  await page("about", "About", (l) => [{ __component: "block.richtext", body: text[l].about }]);
  for (const l of ["th", "en"]) {
    const f = await W("POST", `faqs?locale=${l}`, { data: { question: text[l].faq, answer: `${text[l].faq} — answer`, order: 1 } });
    await publish("faqs", f.data.documentId, l);
  }
  const art = await W("POST", "articles?locale=th", { data: { title: text.th.news, slug: "r5-test-news", kind: "news", excerpt: "R5", body: text.th.news, publishDate: "2026-11-23" } });
  await W("PUT", `articles/${art.data.documentId}?locale=en`, { data: { title: text.en.news, slug: "r5-test-news", kind: "news", excerpt: "R5", body: text.en.news, publishDate: "2026-11-23" } });
  await publish("articles", art.data.documentId, "th"); await publish("articles", art.data.documentId, "en");

  const served = await (await fetch(`${ENGINE}/api/pages?tenant=dgahub&locale=th&populate[blocks][populate]=*`)).json();
  check("the read API serves the published pages of dgahub, and only those", served.data.length === 2 && served.data.every((p) => p.documentId));
  check("another tenant's pages are unchanged", (await (await fetch(`${ENGINE}/api/pages?tenant=dga&locale=th`)).json()).data.every((p) => !["home-blocks", "about"].includes(p.slug) || p.documentId !== served.data[0].documentId));

  // 3. build public-site: tenants from webx-control, content from the Rust engine
  rmSync(join(site, DIST), { recursive: true, force: true });
  rmSync(join(site, ".next", "cache", "fetch-cache"), { recursive: true, force: true });
  const env = { ...process.env, STRAPI_URL: ENGINE, WEBX_CONTROL_URL: CONTROL, NEXT_DIST_DIR: DIST };
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const b1 = spawnSync(npm, ["exec", "--", "next", "build"], { cwd: site, env, stdio: "inherit", shell: process.platform === "win32" });
  check("public-site builds", b1.status === 0);
  if (b1.status === 0) {
    spawnSync(process.execPath, [join(site, "scripts", "set-html-lang.mjs")], { cwd: site, env, stdio: "inherit" });
    const out = join(site, DIST);
    // the home page is dgahub.html next to the dgahub/ folder (and en/dgahub.html)
    const files = htmlFiles(join(out, "dgahub")).concat(htmlFiles(join(out, "en", "dgahub")), [join(out, "dgahub.html"), join(out, "en", "dgahub.html")]);
    const has = (needle) => files.some((f) => readFileSync(f, "utf8").includes(needle));
    check("the Thai home page shows the hero written through the API", has(text.th.hero));
    check("the English home page shows its hero", has(text.en.hero));
    check("the about page shows its text", has(text.th.about) && has(text.en.about));
    check("the FAQ appears", has(text.th.faq));
    check("the news article page exists and shows its title", has(text.th.news));
    check("the identity registered in webx-control is shown", has("Rust hub (R5 test)"));
  }
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (ctl) await stop(ctl);
  if (engine) await stop(engine);
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nrust tenant: all checks passed");
process.exit(failures ? 1 : 0);
