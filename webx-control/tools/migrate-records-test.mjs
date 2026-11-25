#!/usr/bin/env node
// C3: tools/migrate-records.mjs against the real webx-control binary and a fake Strapi (a small HTTP server that answers the few
// calls the tool makes: login, the tenant keys, and the content-manager list with paging and a tenant filter). Page templates,
// page versions and the agent's threads move as they are; reviews and releases carry a `tenant` relation in Strapi and the
// control plane keeps the workspace's key instead.
//
//   node tools/migrate-records-test.mjs [--port 1410]
//
// Needs the release build.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1410");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "migrate-admin-token", SERVICE = "migrate-service-token";
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const control = (method, path, body) => fetch(`${BASE}/internal${path}`, { method, headers: { authorization: `Bearer ${SERVICE}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
const read = async (c, id) => { const r = await control("GET", `/records/${c}/${id}`); return r.ok ? (await r.json()).data : null; };
const list = async (c, ...filters) => (await (await control("GET", `/records/${c}?pageSize=500${filters.map((f) => "&filter=" + encodeURIComponent(f)).join("")}`)).json()).data;

const strapiRows = {
  "api::review.review": [
    { id: 1, documentId: "rev00000000000000000001a", tenant: "dga", documentRef: "art-1", contentType: "api::article.article", title: "ตรวจบทความ", stage: "in_review", kind: "review", requestedBy: "editor@dga.local", note: "โปรดตรวจ", history: [{ from: "draft", to: "in_review", by: "editor@dga.local", at: "2026-11-01T01:00:00.000Z" }], payload: null, createdAt: "2026-11-01T01:00:00.000Z", updatedAt: "2026-11-02T01:00:00.000Z", createdBy: { id: 1 }, publishedAt: null },
    { id: 2, documentId: "rev00000000000000000002b", tenant: "pea", documentRef: "art-2", contentType: "api::article.article", title: "[EN] translation", stage: "approved", kind: "translation", payload: { targetLocale: "en", fields: { title: "Hello" } }, history: [], createdAt: "2026-11-03T01:00:00.000Z", updatedAt: "2026-11-03T02:00:00.000Z" },
    { id: 3, documentId: "rev00000000000000000003c", tenant: null, documentRef: "art-3", contentType: "api::article.article", title: "no workspace", stage: "in_review", createdAt: "2026-05-01T01:00:00.000Z", updatedAt: "2026-05-01T01:00:00.000Z" },
  ],
  "api::release.release": [
    { id: 1, documentId: "rel00000000000000000001a", tenant: "dga", name: "Quarterly", state: "done", scheduledAt: "2026-11-04T01:00:00.000Z", publishedAt: "2026-11-04T01:00:07.000Z", items: [{ contentType: "api::article.article", documentRef: "art-1", title: "A" }, { contentType: "wp:post", documentRef: "12", title: "B" }], note: "ok", createdAt: "2026-11-01T01:00:00.000Z", updatedAt: "2026-11-04T01:00:07.000Z" },
    { id: 2, documentId: "rel00000000000000000002b", tenant: "pea", name: "Draft", state: "draft", scheduledAt: null, publishedAt: null, items: [], createdAt: "2026-11-05T01:00:00.000Z", updatedAt: "2026-11-05T01:00:00.000Z" },
  ],
  "api::page-template.page-template": [
    { id: 1, documentId: "tpl00000000000000000001a", tenantKey: "dga", key: "hero", name: "Hero", blocks: [{ type: "hero" }], publishedAt: "2026-10-01T01:00:00.000Z", createdAt: "2026-10-01T01:00:00.000Z", updatedAt: "2026-10-01T01:00:00.000Z" },
  ],
  "api::page-version.page-version": Array.from({ length: 450 }, (_, i) => ({ id: i + 1, documentId: "ver" + String(i + 1).padStart(21, "0"), tenantKey: i % 2 ? "pea" : "dga", documentRef: "p" + (i % 5), label: "v" + i, snapshot: { n: i }, createdAt: "2026-10-01T01:00:00.000Z", updatedAt: "2026-10-01T01:00:00.000Z" })),
  "api::agent-thread.agent-thread": [
    { id: 1, documentId: "thr00000000000000000001a", tenantKey: "dga", ownerEmail: "editor@dga.local", title: "Thread", messages: [{ role: "user", content: "hi" }], createdAt: "2026-10-02T01:00:00.000Z", updatedAt: "2026-10-02T02:00:00.000Z" },
  ],
};
const broken = new Set();
const fake = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const json = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.method === "POST" && u.pathname === "/admin/login") return json({ data: { token: "jwt-fake" } });
  if (u.pathname === "/api/tenants/keys") return json({ data: [{ key: "dga" }, { key: "pea" }] });
  if (!/^Bearer jwt-fake$/.test(req.headers.authorization || "")) return json({ error: "no" }, 401);
  const m = /^\/content-manager\/collection-types\/([^/]+)$/.exec(u.pathname);
  if (!m || !(decodeURIComponent(m[1]) in strapiRows)) return json({ error: "nope" }, 404);
  const uid = decodeURIComponent(m[1]);
  if (broken.has(uid)) return json({ error: "boom" }, 500);
  const tenant = u.searchParams.get("filters[tenant][key][$eq]");
  const all = strapiRows[uid].filter((r) => (tenant ? r.tenant === tenant : true));
  const page = Number(u.searchParams.get("page") || 1), size = Number(u.searchParams.get("pageSize") || 25);
  // a relation comes back as a summary, not a comparable value: the tool must not rely on it
  json({ results: all.slice((page - 1) * size, page * size).map(({ tenant: t, ...r }) => (t === undefined ? r : { ...r, tenant: t ? { count: 1 } : { count: 0 } })), pagination: { page, pageSize: size, pageCount: Math.max(1, Math.ceil(all.length / size)), total: all.length } });
});
await new Promise((ok) => fake.listen(0, "127.0.0.1", ok));
const STRAPI = `http://127.0.0.1:${fake.address().port}`;

const dir = mkdtempSync(join(tmpdir(), "webx-migrate-records-"));
const server = spawn(exe, ["--port", PORT, "--db", join(dir, "control.db")], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_CONTROL_SERVICE_TOKEN: SERVICE }, stdio: ["ignore", "ignore", "inherit"] });
const stopped = new Promise((ok) => server.on("exit", ok));
// asynchronous on purpose: the fake Strapi lives in this process, so a blocking call here would leave it unable to answer the tool
const run = (...args) => new Promise((ok) => {
  const child = spawn(process.execPath, [join(root, "tools", "migrate-records.mjs"), ...args], { env: { ...process.env, STRAPI_URL: STRAPI, STRAPI_ADMIN_EMAIL: "a@b.c", STRAPI_ADMIN_PASSWORD: "x", WEBX_CONTROL_URL: BASE, WEBX_CONTROL_SERVICE_TOKEN: SERVICE } });
  let out = "", err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  child.on("exit", (code) => ok({ code, out, err }));
});

try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) break; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }

  const dry = await run("--dry-run");
  check("a dry run reads and reports, and writes nothing", dry.code === 0 && /review: 2 row\(s\) in Strapi, nothing written; 1 row\(s\) had no tenant and were left/.test(dry.out) && /release: 2 row\(s\) in Strapi, nothing written/.test(dry.out) && (await read("review", "rev00000000000000000001a")) === null && (await list("page-version")).length === 0, dry.out + dry.err);

  const first = await run();
  check("a run moves every type and reports the review that had no workspace", first.code === 0 && /review: read 2: 2 added, 0 already there; 1 row\(s\) had no tenant and were left/.test(first.out) && /release: read 2: 2 added, 0 already there/.test(first.out) && /page-template: read 1: 1 added/.test(first.out) && /agent-thread: read 1: 1 added/.test(first.out), first.out + first.err);
  check("page versions are read a page at a time and all arrive", /page-version: read 450: 450 added, 0 already there/.test(first.out) && (await list("page-version")).length === 450, first.out);

  const r1 = await read("review", "rev00000000000000000001a");
  check("a review keeps its id, fields, JSON and times, and names its workspace by key", r1 && r1.tenantKey === "dga" && r1.documentRef === "art-1" && r1.contentType === "api::article.article" && r1.title === "ตรวจบทความ" && r1.stage === "in_review" && r1.note === "โปรดตรวจ" && r1.history[0].to === "in_review" && r1.createdAt === "2026-11-01T01:00:00.000Z" && r1.updatedAt === "2026-11-02T01:00:00.000Z", JSON.stringify(r1));
  check("the relation summary and Strapi's own bookkeeping are not carried", r1 && r1.tenant === undefined && r1.createdBy === undefined && r1.publishedAt === undefined, JSON.stringify(r1));
  const r2 = await read("review", "rev00000000000000000002b");
  check("another workspace's review keeps its payload and its own key", r2 && r2.tenantKey === "pea" && r2.payload.fields.title === "Hello" && r2.kind === "translation" && r2.stage === "approved", JSON.stringify(r2));
  check("the review of no workspace was not guessed at", (await read("review", "rev00000000000000000003c")) === null);

  const l1 = await read("release", "rel00000000000000000001a");
  check("a release keeps its items, state, schedule and the time it was published", l1 && l1.tenantKey === "dga" && l1.name === "Quarterly" && l1.state === "done" && l1.scheduledAt === "2026-11-04T01:00:00.000Z" && l1.publishedAt === "2026-11-04T01:00:07.000Z" && l1.items.length === 2 && l1.items[1].contentType === "wp:post" && l1.items[1].documentRef === "12", JSON.stringify(l1));
  const l2 = await read("release", "rel00000000000000000002b");
  check("a draft release stays a draft in its own workspace", l2 && l2.tenantKey === "pea" && l2.state === "draft" && l2.items.length === 0, JSON.stringify(l2));

  const t1 = await read("page-template", "tpl00000000000000000001a");
  check("a page template moves as it is (its key is its own field) without Strapi's publication time", t1 && t1.tenantKey === "dga" && t1.key === "hero" && t1.blocks[0].type === "hero" && t1.publishedAt === undefined, JSON.stringify(t1));

  check("the control plane scopes what moved by workspace", (await list("review", "tenantKey:eq:pea")).length === 1 && (await list("release", "tenantKey:eq:dga")).length === 1 && (await list("page-version", "tenantKey:eq:dga")).length === 225);

  const again = await run();
  check("run again it skips what is there", again.code === 0 && /review: read 2: 0 added, 2 already there/.test(again.out) && /release: read 2: 0 added, 2 already there/.test(again.out) && /page-version: read 450: 0 added, 450 already there/.test(again.out), again.out + again.err);

  const filed = await run("--default-tenant", "dga");
  const r3 = await read("review", "rev00000000000000000003c");
  check("--default-tenant files the review that had no workspace", filed.code === 0 && r3?.tenantKey === "dga" && /1 row\(s\) had no tenant \(filed under dga\)/.test(filed.out), filed.out + filed.err);

  // a page that cannot be read stops that type, says why, and exits non-zero; the other types still move
  strapiRows["api::release.release"].push({ id: 3, documentId: "rel00000000000000000003c", tenant: "dga", name: "Later", state: "draft", items: [], createdAt: "2026-11-06T01:00:00.000Z", updatedAt: "2026-11-06T01:00:00.000Z" });
  strapiRows["api::page-template.page-template"].push({ id: 2, documentId: "tpl00000000000000000002b", tenantKey: "pea", key: "wide", name: "Wide", createdAt: "2026-10-03T01:00:00.000Z", updatedAt: "2026-10-03T01:00:00.000Z" });
  broken.add("api::review.review");
  const bad = await run();
  check("a type that cannot be read fails the run, is named on stderr, and the others still move", bad.code === 1 && /review: reading page 1 of dga: HTTP 500/.test(bad.err) && /release: read 3: 1 added, 2 already there/.test(bad.out) && /page-template: read 2: 1 added, 1 already there/.test(bad.out) && (await read("release", "rel00000000000000000003c"))?.tenantKey === "dga", bad.out + bad.err);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  server.kill("SIGTERM");
  await stopped;
  fake.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control records migration: all checks passed");
process.exitCode = failures ? 1 : 0;
