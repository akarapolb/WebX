#!/usr/bin/env node
// D6: tools/migrate-wp-forms.mjs against the real webx-control binary and a fake WordPress (a small HTTP server that answers the
// REST calls the tool makes: users/me, the wtenant terms, the three form types a page at a time, a media item, a delete of a post
// and of a media item, and the uploads), with the personal data encrypted as wordpress/mu-plugins/pii-crypto.php encrypts it.
//
//   node tools/migrate-wp-forms-test.mjs [--port 1413]
//
// Needs the release build.
import { spawn } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1413");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "migrate-wp-admin-token", SERVICE = "migrate-wp-service-token";
const KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // webx-control's own
const WP_KEY = Buffer.from("wordpress-pii-key-for-the-test!!"); // WordPress's: another 32 bytes
const WRONG_KEY = Buffer.alloc(32, 9).toString("base64");
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const control = (method, path, body) => fetch(`${BASE}/internal${path}`, { method, headers: { authorization: `Bearer ${SERVICE}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
const read = async (c, id) => { const r = await control("GET", `/records/${c}/${id}`); return r.ok ? (await r.json()).data : null; };
const totals = async () => (await Promise.all(["complaint", "application", "contact-message"].map(async (c) => (await (await control("GET", `/records/${c}?pageSize=1`)).json()).meta.pagination.total))).join();
const download = async (id) => {
  const r = await fetch(`${BASE}/internal/files/${id}`, { headers: { authorization: `Bearer ${SERVICE}` } });
  return { status: r.status, tenant: r.headers.get("x-file-tenant"), collection: r.headers.get("x-file-collection"), bytes: Buffer.from(await r.arrayBuffer()) };
};

// what pii-crypto.php's webx_pii_encrypt() writes: base64(iv).base64(ciphertext).base64(tag), AES-256-GCM with a fresh 12-byte IV
const wpEncrypt = (s) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", WP_KEY, iv);
  const ct = Buffer.concat([c.update(s, "utf8"), c.final()]);
  return [iv, ct, c.getAuthTag()].map((b) => b.toString("base64")).join(".");
};
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// a post as WordPress's REST API gives it with context=edit: its times in the site's zone (+07:00 here) and in GMT, and ACF's values
const post = (id, wtenant, title, acf, gmt, modifiedGmt = gmt, status = "publish") => {
  const local = (t) => new Date(Date.parse(`${t}Z`) + 7 * 3600e3).toISOString().slice(0, 19);
  return { id, status, date: local(gmt), date_gmt: gmt, modified: local(modifiedGmt), modified_gmt: modifiedGmt, slug: String(id), title: { raw: title, rendered: escapeHtml(title) }, wtenant, acf, _links: {} };
};

const ORST = 5, RS = 6;
const TERMS = [{ id: ORST, slug: "orst", name: "สำนักงานการวิจัยแห่งชาติ" }, { id: RS, slug: "royalsociety", name: "ราชบัณฑิตยสภา" }, { id: 7, slug: "spare", name: "ไม่มีโพสต์" }];
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const CV = Buffer.from("%PDF-1.4\n% ประวัติ\n%%EOF\n");
const STEPS = [{ t: "2 ม.ค. 2568", d: "รับเรื่องแล้ว" }, { t: "5 ม.ค. 2568", d: "ส่งต่อหน่วยงาน" }];
const wpPosts = {
  complaint: [
    post(101, [ORST], "ORST-CMP-2568-111111", { ref: "ORST-CMP-2568-111111", type: "ทุจริต", subject: "เรื่องของ orst", agency: "กรมตัวอย่าง", detail: "รายละเอียด", anonymous: false, name: wpEncrypt("สมชาย ใจดี"), email: wpEncrypt("somchai@example.com"), phone: wpEncrypt("0811111111"), stage: 2, date: "2025-01-01T01:00:00+00:00", steps: JSON.stringify(STEPS), attachment: 501 }, "2025-01-01T01:00:00", "2025-01-05T01:00:00"),
    // from before WordPress encrypted personal data: plain text, which goes as it is. Its phone passes WordPress's loose "looks
    // encrypted" test, so WordPress never encrypted it either. And a site's ACF gave the stage as text.
    post(102, [RS], "RS-CMP-2568-222222", { ref: "RS-CMP-2568-222222", type: "ร้องเรียน", subject: "เรื่องของ royalsociety", agency: "", detail: "d", anonymous: false, name: "นก", email: "nok@example.com", phone: "02.123.4567", stage: "1", date: "1 ก.พ. 2568", steps: "", attachment: "" }, "2025-02-01T01:00:00"),
    // no wtenant term: WordPress's own form route was given a tenant it did not know
    post(103, [], "ORST-CMP-2568-333333", { ref: "ORST-CMP-2568-333333", type: "", subject: "ไม่มีหน่วยงาน", agency: "", detail: "", anonymous: true, name: "", email: "", phone: "", stage: 0, date: "2025-03-01T01:00:00+00:00", steps: "", attachment: false }, "2025-03-01T01:00:00"),
  ],
  application: [
    post(201, [ORST], "ORST-APP-2568-444444", { ref: "ORST-APP-2568-444444", jobId: "J-7", position: "นักพัฒนา", name: wpEncrypt("ผู้สมัคร คนหนึ่ง"), email: wpEncrypt("applicant@example.com"), phone: wpEncrypt("0822222222"), note: "พร้อมเริ่มงาน", stage: 1, date: "2025-04-01T01:00:00+00:00", resume: 502, extra: "" }, "2025-04-01T01:00:00"),
    // unpublished by an editor: still a submission
    post(202, [RS], "RS-APP-2568-555555", { ref: "RS-APP-2568-555555", jobId: "J-9", position: "บรรณารักษ์", name: wpEncrypt("สมศรี"), email: wpEncrypt("somsri@example.com"), phone: "", note: "", stage: 0, date: "2025-05-01T01:00:00+00:00", resume: false, extra: '{"source":"walk-in"}' }, "2025-05-01T01:00:00", "2025-05-02T01:00:00", "draft"),
  ],
  "contact-message": [
    // the sender's name is the post's title, kept plain; WordPress escapes it outside context=edit
    post(301, [RS], "สมหญิง & ลูก", { email: wpEncrypt("somying@example.com"), phone: wpEncrypt("0833333333"), subject: "สอบถาม", message: "สวัสดีครับ", handled: true }, "2025-06-01T01:00:00"),
    post(302, [ORST], "ไม่ระบุชื่อ", { email: "", phone: "", subject: "", message: "ข้อความ", handled: false }, "2025-06-02T01:00:00"),
  ],
};
const media = { 501: "/wp-content/uploads/2025/01/หลักฐาน.pdf", 502: "/wp-content/uploads/2025/04/cv.pdf" };
const uploads = { "/wp-content/uploads/2025/01/หลักฐาน.pdf": PDF, "/wp-content/uploads/2025/04/cv.pdf": CV };
const deleted = [], deletedMedia = [], downloadAuth = [];
const WP_USER = "migrator", WP_APP_PASSWORD = "abcd efgh ijkl mnop qrst uvwx";
const BASIC = `Basic ${Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64")}`;

const fake = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const path = decodeURIComponent(u.pathname);
  const json = (o, s = 200, headers = {}) => { res.writeHead(s, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(o)); };
  if (path.startsWith("/wp-content/uploads/")) {
    downloadAuth.push(req.headers.authorization || "");
    if (!(path in uploads)) return json({ code: "not_found" }, 404);
    res.writeHead(200, { "content-type": "application/pdf" });
    return res.end(uploads[path]);
  }
  if (!path.startsWith("/wp-json/")) return json({ code: "rest_no_route" }, 404);
  if (req.headers.authorization !== BASIC) return json({ code: "incorrect_password", message: "The provided password is an invalid application password." }, 401);
  const route = path.slice("/wp-json".length);
  // a list, a page at a time: at most 2 a page here, so the tool has to follow X-WP-TotalPages
  const list = (all) => {
    const size = Math.min(Number(u.searchParams.get("per_page") || 10), 2), page = Number(u.searchParams.get("page") || 1);
    const pages = Math.max(1, Math.ceil(all.length / size));
    if (page > pages) return json({ code: "rest_post_invalid_page_number" }, 400);
    json(all.slice((page - 1) * size, page * size), 200, { "x-wp-total": String(all.length), "x-wp-totalpages": String(pages) });
  };
  if (route === "/wp/v2/users/me") return json({ id: 1, name: WP_USER });
  if (route === "/wp/v2/wtenant") return list(TERMS);
  const m = /^\/wp\/v2\/(complaint|application|contact-message)(?:\/(\d+))?$/.exec(route);
  if (m && req.method === "GET" && !m[2]) {
    // as WordPress: only published posts unless asked for more, and the stored title only with context=edit
    const statuses = (u.searchParams.get("status") || "publish").split(",");
    const edit = u.searchParams.get("context") === "edit";
    const all = wpPosts[m[1]].filter((p) => (statuses.includes("any") ? p.status !== "trash" : statuses.includes(p.status)));
    return list(all.map((p) => (edit ? p : { ...p, title: { rendered: p.title.rendered } })));
  }
  if (m && req.method === "DELETE" && m[2]) {
    if (u.searchParams.get("force") !== "true") return json({ code: "rest_trash_not_supported" }, 501);
    const i = wpPosts[m[1]].findIndex((p) => p.id === Number(m[2]));
    if (i < 0) return json({ code: "rest_post_invalid_id" }, 404);
    const [gone] = wpPosts[m[1]].splice(i, 1);
    deleted.push(gone.id);
    return json({ deleted: true, previous: gone });
  }
  const mm = /^\/wp\/v2\/media\/(\d+)$/.exec(route);
  if (mm && req.method === "GET" && mm[1] in media) return json({ id: Number(mm[1]), mime_type: "application/pdf", source_url: `${WP_ORIGIN}${encodeURI(media[mm[1]])}` });
  if (mm && req.method === "DELETE") {
    // as WordPress: an attachment is not trashed, only deleted with force=true
    if (u.searchParams.get("force") !== "true") return json({ code: "rest_trash_not_supported" }, 501);
    if (!(mm[1] in media)) return json({ code: "rest_post_invalid_id" }, 404);
    delete media[mm[1]];
    deletedMedia.push(Number(mm[1]));
    return json({ deleted: true });
  }
  json({ code: "rest_no_route" }, 404);
});
await new Promise((ok) => fake.listen(0, "127.0.0.1", ok));
const WP_ORIGIN = `http://127.0.0.1:${fake.address().port}`;

const dir = mkdtempSync(join(tmpdir(), "webx-migrate-wp-forms-"));
const server = spawn(exe, ["--port", PORT, "--db", join(dir, "control.db")], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_CONTROL_SERVICE_TOKEN: SERVICE, WEBX_PII_KEY: KEY }, stdio: ["ignore", "ignore", "inherit"] });
const stopped = new Promise((ok) => server.on("exit", ok));
const toolEnv = { WORDPRESS_URL: `${WP_ORIGIN}/wp-json`, WP_USER, WP_APP_PASSWORD, WEBX_WP_PII_KEY: WP_KEY.toString("base64"), WEBX_CONTROL_URL: BASE, WEBX_CONTROL_SERVICE_TOKEN: SERVICE };
// asynchronous on purpose: the fake WordPress lives in this process, so a blocking call here would leave it unable to answer the tool
const run = (args = [], env = {}) => new Promise((ok) => {
  const child = spawn(process.execPath, [join(root, "tools", "migrate-wp-forms.mjs"), ...args], { env: { ...process.env, ...toolEnv, ...env } });
  let out = "", err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  // "close", not "exit": only then has all of the child's output been read
  child.on("close", (code) => ok({ code, out, err }));
});

try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) break; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const key of ["orst", "royalsociety"]) await fetch(`${BASE}/admin/tenants/${key}`, { method: "PUT", headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body: JSON.stringify({ engine: "wordpress", publicTemplate: key }) });

  const flags = [await run(["--dry-run", "--move"]), await run(["--dryrun"]), await run(["--default-tenant"])];
  check("flags that do not fit are refused: --dry-run with --move, an unknown flag, --default-tenant with no key", flags.every((r) => r.code === 2), JSON.stringify(flags));
  const noKey = await run([], { WEBX_WP_PII_KEY: "" }), shortKey = await run([], { WEBX_WP_PII_KEY: Buffer.alloc(16, 1).toString("base64") });
  check("WEBX_WP_PII_KEY is required, and must be 32 bytes", noKey.code === 2 && /WEBX_WP_PII_KEY is required/.test(noKey.err) && shortKey.code === 2 && /exactly 32 bytes/.test(shortKey.err), noKey.err + shortKey.err);
  const badLogin = await run([], { WP_APP_PASSWORD: "wrong" });
  check("credentials WordPress does not take stop the run before anything is read", badLogin.code === 1 && /WP_USER and WP_APP_PASSWORD .*HTTP 401/.test(badLogin.err), badLogin.out + badLogin.err);

  const wrong = await run([], { WEBX_WP_PII_KEY: WRONG_KEY });
  check("a WEBX_WP_PII_KEY that does not fit stops the run, naming the post, and nothing is written", wrong.code === 1 && /complaint: post 101: name does not decrypt with WEBX_WP_PII_KEY.*nothing was written/.test(wrong.err) && (await totals()) === "0,0,0" && downloadAuth.length === 0, wrong.out + wrong.err);

  const dryRun = await run(["--dry-run"]);
  check("a dry run reads, decrypts and reports, and writes nothing", dryRun.code === 0 && /complaint: read 2, nothing written; 1 post\(s\) had no tenant and were left \(use --default-tenant\): 103\n/.test(dryRun.out) && /application: read 2, nothing written\n/.test(dryRun.out) && /contact-message: read 2, nothing written\n/.test(dryRun.out) && (await totals()) === "0,0,0" && downloadAuth.length === 0, dryRun.out + dryRun.err);

  const first = await run();
  check("a run moves each workspace's posts, carries the files, and reports the post with no tenant", first.code === 0 && /complaint: read 2: 2 added, 0 already there, 1 file\(s\) carried; 1 post\(s\) had no tenant and were left \(use --default-tenant\): 103\n/.test(first.out) && /application: read 2: 2 added, 0 already there, 1 file\(s\) carried\n/.test(first.out) && /contact-message: read 2: 2 added, 0 already there\n/.test(first.out), first.out + first.err);
  const c1 = await read("complaint", "wp-complaint-101");
  check("a complaint keeps its reference, stage, steps, date, other fields and times, in its workspace", c1 && c1.tenantKey === "orst" && c1.ref === "ORST-CMP-2568-111111" && c1.stage === 2 && JSON.stringify(c1.steps) === JSON.stringify(STEPS) && c1.date === "2025-01-01T01:00:00+00:00" && c1.type === "ทุจริต" && c1.subject === "เรื่องของ orst" && c1.agency === "กรมตัวอย่าง" && c1.detail === "รายละเอียด" && c1.anonymous === false && c1.createdAt === "2025-01-01T01:00:00.000Z" && c1.updatedAt === "2025-01-05T01:00:00.000Z", JSON.stringify(c1));
  check("its personal data was decrypted and reads back plain (webx-control encrypted it again under its own key)", c1 && c1.name === "สมชาย ใจดี" && c1.email === "somchai@example.com" && c1.phone === "0811111111", JSON.stringify(c1));
  check("WordPress's own bookkeeping is not carried", c1 && ["title", "status", "wtenant", "acf", "slug", "_links", "date_gmt", "modified"].every((k) => c1[k] === undefined), JSON.stringify(c1));
  const f1 = c1?.attachment?.documentId ? await download(c1.attachment.documentId) : null;
  check("its attachment is stored by the control plane, whole, for the same workspace and form, and downloads", f1?.status === 200 && f1.bytes.equals(PDF) && f1.tenant === "orst" && f1.collection === "complaint" && c1.attachment.name === "หลักฐาน.pdf", JSON.stringify(c1?.attachment));
  check("the files were downloaded without WordPress's credentials", downloadAuth.length === 2 && downloadAuth.every((a) => a === ""), JSON.stringify(downloadAuth));
  const c2 = await read("complaint", "wp-complaint-102");
  check("a row from before the encryption goes as it is, and a stage given as text is a number", c2 && c2.tenantKey === "royalsociety" && c2.name === "นก" && c2.email === "nok@example.com" && c2.stage === 1 && c2.date === "1 ก.พ. 2568" && c2.steps === undefined && c2.attachment === undefined, JSON.stringify(c2));
  check("a plain value that only looks encrypted (02.123.4567) moves as it is, with a warning, and does not stop the run", c2?.phone === "02.123.4567" && /warning: complaint: post 102: phone only looks encrypted/.test(first.err), JSON.stringify(c2) + first.err);
  check("the post with no tenant was not guessed at", (await read("complaint", "wp-complaint-103")) === null);
  const a1 = await read("application", "wp-application-201");
  const f2 = a1?.resume?.documentId ? await download(a1.resume.documentId) : null;
  check("an application keeps its reference and fields, decrypted, and its résumé is carried", a1 && a1.tenantKey === "orst" && a1.ref === "ORST-APP-2568-444444" && a1.jobId === "J-7" && a1.position === "นักพัฒนา" && a1.name === "ผู้สมัคร คนหนึ่ง" && a1.email === "applicant@example.com" && a1.phone === "0822222222" && a1.note === "พร้อมเริ่มงาน" && a1.stage === 1 && a1.extra === undefined && a1.resume.name === "cv.pdf" && f2?.bytes.equals(CV) && f2.collection === "application", JSON.stringify(a1));
  const a2 = await read("application", "wp-application-202");
  check("an application an editor had unpublished moves too, its extra as JSON", a2 && a2.tenantKey === "royalsociety" && a2.extra?.source === "walk-in" && a2.name === "สมศรี" && a2.resume === undefined && a2.createdAt === "2025-05-01T01:00:00.000Z" && a2.updatedAt === "2025-05-02T01:00:00.000Z", JSON.stringify(a2));
  const m1 = await read("contact-message", "wp-contact-message-301"), m2 = await read("contact-message", "wp-contact-message-302");
  check("a contact message's sender is the post's title as stored, with its email and phone decrypted", m1 && m1.tenantKey === "royalsociety" && m1.name === "สมหญิง & ลูก" && m1.email === "somying@example.com" && m1.phone === "0833333333" && m1.subject === "สอบถาม" && m1.message === "สวัสดีครับ" && m1.handled === true && m2?.tenantKey === "orst" && m2.name === "ไม่ระบุชื่อ" && m2.email === "" && m2.handled === false, JSON.stringify([m1, m2]));
  const tc = await fetch(`${BASE}/api/complaints/track/ORST-CMP-2568-111111?tenant=orst`);
  const tracked = tc.status === 200 ? (await tc.json()).data : null;
  const ta = await fetch(`${BASE}/api/applications/track/RS-APP-2568-555555?tenant=royalsociety`);
  check("a visitor tracks a moved complaint and application by the reference WordPress gave", tracked?.steps?.length === 2 && tracked.stage === 2 && ta.status === 200, JSON.stringify(tracked) + " " + ta.status);
  check("WordPress keeps its posts and their files without --move", deleted.length === 0 && deletedMedia.length === 0 && Object.values(wpPosts).flat().length === 7);
  check("each workspace's reference prefix is reported, with the admin call that keeps it", /reference prefixes in WordPress: orst: ORST; royalsociety: RS\n/.test(first.out) && first.out.includes('  PUT /admin/tenants/orst/forms {"refPrefix": "ORST"}\n') && first.out.includes('  PUT /admin/tenants/royalsociety/forms {"refPrefix": "RS"}\n') && /-APP-.*-JOB-/.test(first.out), first.out);

  const again = await run();
  check("run again it adds nothing and carries no file twice", again.code === 0 && /complaint: read 2: 0 added, 2 already there, 0 file\(s\) carried/.test(again.out) && /application: read 2: 0 added, 2 already there, 0 file\(s\) carried/.test(again.out) && /contact-message: read 2: 0 added, 2 already there/.test(again.out) && (await totals()) === "2,2,2" && downloadAuth.length === 2, again.out + again.err);

  const filed = await run(["--default-tenant", "orst"]);
  const c3 = await read("complaint", "wp-complaint-103");
  check("--default-tenant files the post that had no tenant", filed.code === 0 && /complaint: read 3: 1 added, 2 already there, 0 file\(s\) carried; 1 post\(s\) had no tenant \(filed under orst\): 103\n/.test(filed.out) && c3?.tenantKey === "orst" && c3.ref === "ORST-CMP-2568-333333" && c3.anonymous === true, `exit ${filed.code}: ${filed.out}${filed.err}`);

  // a WordPress that started its ids again: post 101 is now another complaint, and its id is not proof it was moved
  const p101 = wpPosts.complaint.find((p) => p.id === 101);
  p101.acf = { ...p101.acf, ref: "ORST-CMP-2569-999999" };
  const reused = await run(["--move"]);
  check("a post whose id the control plane holds for another submission stops its form, neither skipped nor deleted; the other forms go on", reused.code === 1 && /complaint: post 101: wp-complaint-101 is already in the control plane as another submission/.test(reused.err) && !deleted.includes(101) && !deleted.includes(102) && (await read("complaint", "wp-complaint-101"))?.ref === "ORST-CMP-2568-111111" && /application: read 2: 0 added, 2 already there, 0 file\(s\) carried, 2 deleted from WordPress with 1 file\(s\)/.test(reused.out) && deletedMedia.join() === "502", reused.out + reused.err + JSON.stringify(deleted) + JSON.stringify(deletedMedia));
  p101.acf = { ...p101.acf, ref: "ORST-CMP-2568-111111" };

  const moved = await run(["--move"]);
  check("--move deletes from WordPress what is safely in the control plane", moved.code === 0 && /complaint: read 2: 0 added, 2 already there, 0 file\(s\) carried, 2 deleted from WordPress with 1 file\(s\); 1 post\(s\) had no tenant and were left \(use --default-tenant\): 103\n/.test(moved.out) && [...deleted].sort().join() === "101,102,201,202,301,302" && (await totals()) === "3,2,2", moved.out + moved.err + JSON.stringify(deleted));
  check("and each moved post's file with it, from WordPress's media library (an upload is served to anyone with its URL)", [...deletedMedia].sort().join() === "501,502", JSON.stringify(deletedMedia));
  check("the post with no tenant is still in WordPress, untouched", wpPosts.complaint.map((p) => p.id).join() === "103");

  // a file that cannot be downloaded fails its form and the run; its post is neither imported nor deleted
  wpPosts.complaint.push(post(104, [ORST], "ORST-CMP-2568-666666", { ref: "ORST-CMP-2568-666666", subject: "ไฟล์หาย", name: "", email: "", phone: "", stage: 0, attachment: 599 }, "2025-07-01T01:00:00"));
  media[599] = "/wp-content/uploads/2025/07/gone.pdf";
  const broken = await run(["--move"]);
  check("a file that cannot be downloaded fails the run, and its post is neither imported nor deleted", broken.code === 1 && /complaint: post 104: downloading gone\.pdf: HTTP 404/.test(broken.err) && (await read("complaint", "wp-complaint-104")) === null && wpPosts.complaint.some((p) => p.id === 104), broken.out + broken.err);

  // the calls the tool printed are ones webx-control takes, and they keep each prefix for new submissions
  const calls = [...first.out.matchAll(/^ {2}PUT (\/admin\/tenants\/[a-z0-9-]+\/forms) (\{.*\})$/gm)];
  const answers = [];
  for (const [, path, body] of calls) answers.push((await fetch(`${BASE}${path}`, { method: "PUT", headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body })).status);
  const fresh = await (await control("POST", "/records/complaint", { data: { tenantKey: "royalsociety", subject: "เรื่องใหม่" } })).json();
  check("the printed calls are ones webx-control takes, and a new royalsociety complaint then reads RS-CMP-...", calls.length === 2 && answers.every((s) => s === 201) && /^RS-CMP-\d{4}-\d{6}$/.test(fresh.data?.ref || ""), JSON.stringify({ answers, fresh }));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  server.kill("SIGTERM");
  await stopped;
  fake.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control WordPress forms migration: all checks passed");
process.exit(failures ? 1 : 0);
