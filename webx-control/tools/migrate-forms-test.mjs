#!/usr/bin/env node
// C5: tools/migrate-forms.mjs against the real webx-control binary and a fake Strapi (a small HTTP server that answers the few
// calls the tool makes: login, the tenant list, the content-manager list with a tenant filter, a delete, and the uploads).
//
//   node tools/migrate-forms-test.mjs [--port 1409]
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
const PORT = arg("port", "1409");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "migrate-admin-token", SERVICE = "migrate-service-token";
const KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const NODE_CIPHERTEXT = "uWOS7y4+yzsKaLoe.isMYWE0h1XcUW0CwkM/CKc0RWQ==.09vkzS3qO7+A/Wk1z38aiw=="; // "somchai@example.com" as Strapi's Node code encrypts it
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const control = (method, path, body, raw = false) => fetch(`${BASE}/internal${path}`, { method, headers: { authorization: `Bearer ${SERVICE}`, ...(body && !raw ? { "content-type": "application/json" } : {}) }, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
const read = async (c, id) => { const r = await control("GET", `/records/${c}/${id}`); return r.ok ? (await r.json()).data : null; };

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const strapiRows = {
  "api::complaint.complaint": [
    { id: 1, documentId: "cmp00000000000000000001a", tenant: "pea", ref: "DGA-CMP-2568-111111", type: "ทุจริต", subject: "เรื่องของ pea", detail: "d", name: "สมชาย", email: "somchai@example.com", phone: "0811111111", anonymous: false, stage: 2, steps: [{ note: "รับเรื่อง" }], date: "1 ม.ค. 2568", createdAt: "2025-01-01T01:00:00.000Z", updatedAt: "2025-01-05T01:00:00.000Z", createdBy: { id: 1 }, publishedAt: "2025-01-01T01:00:00.000Z", attachment: { id: 7, name: "หลักฐาน.pdf", url: "/uploads/evidence.pdf", mime: "application/pdf", size: PDF.length } },
    { id: 2, documentId: "cmp00000000000000000002b", tenant: "dga", ref: "DGA-CMP-2568-222222", subject: "เรื่องของ dga", name: "นก", email: NODE_CIPHERTEXT, stage: 0, createdAt: "2025-02-01T01:00:00.000Z", updatedAt: "2025-02-01T01:00:00.000Z", attachment: null },
    { id: 3, documentId: "cmp00000000000000000003c", tenant: null, ref: "DGA-CMP-2568-333333", subject: "ไม่มีหน่วยงาน", name: "ไม่ระบุ", stage: 0, createdAt: "2025-03-01T01:00:00.000Z", updatedAt: "2025-03-01T01:00:00.000Z" },
  ],
  "api::application.application": [
    { id: 1, documentId: "app00000000000000000001a", tenant: "pea", ref: "DGA-JOB-2568-444444", position: "นักพัฒนา", name: "ผู้สมัคร", email: "a@example.com", stage: 1, createdAt: "2025-04-01T01:00:00.000Z", updatedAt: "2025-04-01T01:00:00.000Z", resume: { id: 8, name: "cv.pdf", url: "/uploads/cv.pdf", mime: "application/pdf", size: PDF.length } },
  ],
  "api::registration.registration": [
    { id: 1, documentId: "reg00000000000000000001a", tenant: "dga", username: "nok1234", email: "n@example.com", firstname: "นก", lastname: "ใจดี", verified: true, createdAt: "2025-05-01T01:00:00.000Z", updatedAt: "2025-05-01T01:00:00.000Z" },
  ],
  "api::contact-message.contact-message": [
    { id: 1, documentId: "msg00000000000000000001a", tenant: "pea", name: "ติดต่อ", message: "สวัสดี", handled: true, createdAt: "2025-06-01T01:00:00.000Z", updatedAt: "2025-06-01T01:00:00.000Z" },
  ],
};
const uploads = { "/uploads/evidence.pdf": PDF, "/uploads/cv.pdf": PDF };
const deleted = [];
const fake = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const json = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.method === "POST" && u.pathname === "/admin/login") return json({ data: { token: "jwt-fake" } });
  if (u.pathname === "/api/tenants/keys") return json({ data: [{ key: "dga" }, { key: "pea" }] });
  if (u.pathname.startsWith("/uploads/")) {
    if (u.pathname in uploads) { res.writeHead(200); return res.end(uploads[u.pathname]); }
    return json({ error: "not found" }, 404);
  }
  if (!/^Bearer jwt-fake$/.test(req.headers.authorization || "")) return json({ error: "no" }, 401);
  const m = /^\/content-manager\/collection-types\/([^/]+)(?:\/([^/]+))?$/.exec(u.pathname);
  if (!m || !(decodeURIComponent(m[1]) in strapiRows)) return json({ error: "nope" }, 404);
  const uid = decodeURIComponent(m[1]);
  if (req.method === "DELETE" && m[2]) {
    const i = strapiRows[uid].findIndex((r) => r.documentId === m[2]);
    if (i < 0) return json({ error: "gone" }, 404);
    deleted.push(strapiRows[uid].splice(i, 1)[0].documentId);
    return json({ data: null });
  }
  const tenant = u.searchParams.get("filters[tenant][key][$eq]");
  const all = strapiRows[uid].filter((r) => (tenant ? r.tenant === tenant : true));
  const page = Number(u.searchParams.get("page") || 1), size = Number(u.searchParams.get("pageSize") || 25);
  json({ results: all.slice((page - 1) * size, page * size).map(({ tenant: t, ...r }) => ({ ...r, tenant: t ? { key: t, count: 1 } : { count: 0 } })), pagination: { page, pageSize: size, pageCount: Math.max(1, Math.ceil(all.length / size)), total: all.length } });
});
await new Promise((ok) => fake.listen(0, "127.0.0.1", ok));
const STRAPI = `http://127.0.0.1:${fake.address().port}`;

const dir = mkdtempSync(join(tmpdir(), "webx-migrate-forms-"));
const server = spawn(exe, ["--port", PORT, "--db", join(dir, "control.db")], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_CONTROL_SERVICE_TOKEN: SERVICE, WEBX_PII_KEY: KEY }, stdio: ["ignore", "ignore", "inherit"] });
const stopped = new Promise((ok) => server.on("exit", ok));
// asynchronous on purpose: the fake Strapi lives in this process, so a blocking call here would leave it unable to answer the tool
const run = (...args) => new Promise((ok) => {
  const child = spawn(process.execPath, [join(root, "tools", "migrate-forms.mjs"), ...args], { env: { ...process.env, STRAPI_URL: STRAPI, STRAPI_ADMIN_EMAIL: "a@b.c", STRAPI_ADMIN_PASSWORD: "x", WEBX_CONTROL_URL: BASE, WEBX_CONTROL_SERVICE_TOKEN: SERVICE } });
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
  for (const key of ["dga", "pea"]) await fetch(`${BASE}/admin/tenants/${key}`, { method: "PUT", headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body: JSON.stringify({ engine: "strapi", publicTemplate: "gov-portal" }) });

  const dryRun = (await run("--dry-run"));
  check("a dry run reads and reports, and writes nothing", dryRun.code === 0 && /complaint: read 2, nothing written; 1 row\(s\) had no tenant/.test(dryRun.out) && (await read("complaint", "cmp00000000000000000001a")) === null, dryRun.out + dryRun.err);

  const first = (await run());
  check("a run moves each workspace's rows, carries the file, and reports the row that had no tenant", first.code === 0 && /complaint: read 2: 2 added, 0 already there, 1 file\(s\) carried; 1 row\(s\) had no tenant and were left/.test(first.out) && /application: read 1: 1 added, 0 already there, 1 file\(s\) carried/.test(first.out) && /registration: read 1: 1 added/.test(first.out) && /contact-message: read 1: 1 added/.test(first.out), first.out + first.err);
  const c1 = await read("complaint", "cmp00000000000000000001a");
  check("a row keeps its id, reference, stage, steps, times and workspace, with the personal data readable", c1 && c1.ref === "DGA-CMP-2568-111111" && c1.stage === 2 && c1.steps[0].note === "รับเรื่อง" && c1.tenantKey === "pea" && c1.name === "สมชาย" && c1.email === "somchai@example.com" && c1.phone === "0811111111" && c1.createdAt === "2025-01-01T01:00:00.000Z" && c1.updatedAt === "2025-01-05T01:00:00.000Z", JSON.stringify(c1));
  check("Strapi's own bookkeeping is not carried", c1 && c1.createdBy === undefined && c1.publishedAt === undefined && c1.tenant === undefined && c1.status === undefined, JSON.stringify(c1));
  const fileDl = c1 && (await fetch(`${BASE}/internal/files/${c1.attachment.documentId}`, { headers: { authorization: `Bearer ${SERVICE}` } }));
  check("its file is carried: stored by the control plane, whole, for the same workspace and form", fileDl?.status === 200 && Buffer.from(await fileDl.arrayBuffer()).equals(PDF) && fileDl.headers.get("x-file-tenant") === "pea" && fileDl.headers.get("x-file-collection") === "complaint" && c1.attachment.name === "หลักฐาน.pdf", JSON.stringify(c1?.attachment));
  const c2 = await read("complaint", "cmp00000000000000000002b");
  check("a value Strapi had encrypted under the same key is kept and reads back", c2 && c2.email === "somchai@example.com" && c2.tenantKey === "dga" && c2.attachment === undefined, JSON.stringify(c2));
  check("the row with no tenant was not guessed at", (await read("complaint", "cmp00000000000000000003c")) === null);
  const ap = await read("application", "app00000000000000000001a");
  check("an application's résumé is carried too", ap && ap.resume?.name === "cv.pdf" && ap.ref === "DGA-JOB-2568-444444" && ap.tenantKey === "pea", JSON.stringify(ap));
  const rg = await read("registration", "reg00000000000000000001a");
  check("a registration keeps its username and its verified flag", rg && rg.username === "nok1234" && rg.verified === true && rg.firstname === "นก" && rg.tenantKey === "dga", JSON.stringify(rg));
  check("the moved complaint can be tracked by its reference", (await fetch(`${BASE}/api/complaints/track/DGA-CMP-2568-111111?tenant=pea`)).status === 200);
  check("Strapi's rows are still there without --move", strapiRows["api::complaint.complaint"].length === 3 && deleted.length === 0);

  const again = (await run());
  check("run again it skips what is there and carries no file twice", again.code === 0 && /complaint: read 2: 0 added, 2 already there, 0 file\(s\) carried/.test(again.out) && /application: read 1: 0 added, 1 already there, 0 file\(s\) carried/.test(again.out), again.out + again.err);

  const filed = (await run("--default-tenant", "dga"));
  const c3 = await read("complaint", "cmp00000000000000000003c");
  check("--default-tenant files the row that had no tenant", filed.code === 0 && c3?.tenantKey === "dga" && /1 row\(s\) had no tenant \(filed under dga\)/.test(filed.out), filed.out + filed.err);

  const moved = (await run("--move"));
  check("--move deletes from Strapi only what is safely in the control plane", moved.code === 0 && /complaint: read 2: 0 added, 2 already there, 0 file\(s\) carried, 2 deleted from Strapi; 1 row\(s\) had no tenant and were left/.test(moved.out) && deleted.sort().join() === ["app00000000000000000001a", "cmp00000000000000000001a", "cmp00000000000000000002b", "msg00000000000000000001a", "reg00000000000000000001a"].sort().join(), moved.out + moved.err + JSON.stringify(deleted));
  check("the row that had no tenant is still in Strapi, untouched", strapiRows["api::complaint.complaint"].map((r) => r.documentId).join() === "cmp00000000000000000003c");
  check("--dry-run with --move is refused", (await run("--dry-run", "--move")).code === 2);

  // a file that cannot be downloaded stops that row, says why, and exits non-zero; the row is not half-moved
  strapiRows["api::complaint.complaint"].push({ id: 9, documentId: "cmp00000000000000000009z", tenant: "pea", ref: "DGA-CMP-2568-999999", subject: "file missing", stage: 0, createdAt: "2025-07-01T01:00:00.000Z", updatedAt: "2025-07-01T01:00:00.000Z", attachment: { name: "gone.pdf", url: "/uploads/missing.pdf" } });
  const broken = (await run());
  check("a file that cannot be downloaded fails the run and the row is not imported", broken.code === 1 && /downloading gone\.pdf: HTTP/.test(broken.err) && (await read("complaint", "cmp00000000000000000009z")) === null, broken.out + broken.err);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  server.kill("SIGTERM");
  await stopped;
  fake.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control forms migration: all checks passed");
process.exit(failures ? 1 : 0);
