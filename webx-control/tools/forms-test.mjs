#!/usr/bin/env node
// C5, the form inboxes (decisions D6 and D12): the real webx-control binary, over HTTP, called the way a visitor's browser and
// Studio call it. A visitor's complaint, application, registration and contact message are stored with their personal data
// encrypted, a reference number comes back, a citizen tracks by it, the captcha and the rate limit are enforced, what the
// server owns cannot be set by a visitor, and Studio's records API reads and edits the rows with the data decrypted.
//
//   node tools/forms-test.mjs [--port 1408]
//
// Needs the release build.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1408");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "forms-admin-token", SERVICE = "forms-service-token";
// Strapi's own CI key (0123456789abcdef0123456789abcdef), so a value made by Strapi's Node code is readable here
const KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const OTHER_KEY = Buffer.alloc(32, 7).toString("base64");
const NODE_CIPHERTEXT = "uWOS7y4+yzsKaLoe.isMYWE0h1XcUW0CwkM/CKc0RWQ==.09vkzS3qO7+A/Wk1z38aiw=="; // "somchai@example.com", made with Node's crypto
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

const dir = mkdtempSync(join(tmpdir(), "webx-forms-"));
const db = join(dir, "control.db");
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const call = async (method, path, { token, body, headers } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(headers || {}) }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j, headers: Object.fromEntries(r.headers) };
};
let server;
async function up(args = [], env = {}) {
  server = spawn(exe, ["--port", PORT, "--db", db, ...args], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_CONTROL_SERVICE_TOKEN: SERVICE, WEBX_PII_KEY: KEY, ...env }, stdio: ["ignore", "ignore", "inherit"] });
  server.done = new Promise((ok) => server.on("exit", ok));
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) return; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
}
const down = async () => { server.kill("SIGTERM"); await server.done; };

// one address per request, so no allowance but the one a test means to hit is used up
let n = 0;
const ip = () => `10.60.${Math.floor(++n / 250)}.${n % 250}`;
const solved = async () => {
  const c = (await call("GET", "/api/captcha", { headers: { "x-forwarded-for": ip() } })).json.data;
  const [a, b] = c.question.match(/\d+/g).map(Number);
  return { captchaId: c.id, captchaAnswer: String(a + b) };
};
const submit = async (plural, data, { tenant = "pea", captcha, address = ip(), extra = {} } = {}) =>
  call("POST", `/api/${plural}?tenant=${tenant}`, { body: { data, ...(captcha === undefined ? await solved() : captcha), ...extra }, headers: { "x-forwarded-for": address } });
const admin = (method, path, body) => call(method, `/internal/records/${path}`, { token: SERVICE, body });
const read = async (collection, id) => (await admin("GET", `${collection}/${id}`)).json?.data;
const track = (plural, ref, tenant = "pea", address = ip()) => call("GET", `/api/${plural}/track/${encodeURIComponent(ref)}?tenant=${tenant}`, { headers: { "x-forwarded-for": address } });

const complaint = { type: "ทุจริต/ไม่โปร่งใส", subject: "ขอตรวจสอบ", detail: "รายละเอียดของเรื่อง", name: "สมชาย ใจดี", email: "somchai@example.com", phone: "0812345678", date: "25/11/2569", anonymous: false };

try {
  // ---- without a personal-data key nothing that holds personal data is written or read
  await up([], { WEBX_PII_KEY: "", WEBX_CAPTCHA: "off" });
  for (const key of ["dga", "pea"]) await call("PUT", `/admin/tenants/${key}`, { token: ADMIN, body: { engine: "strapi", publicTemplate: "gov-portal" } });
  check("without WEBX_PII_KEY a visitor's form is refused: 503", (await submit("contact-messages", { name: "N", message: "m" }, { captcha: {} })).status === 503);
  check("and the records API will not read a form collection: 503", (await admin("GET", "complaint")).status === 503);
  check("a collection with no personal data is unaffected", (await admin("GET", "consent-log")).status === 200);
  await down();

  // ---- with the key, captcha off: the shape of a submission
  await up([], { WEBX_CAPTCHA: "off" });
  const plain = await submit("contact-messages", { name: "N", message: "m" }, { captcha: {} });
  check("with WEBX_CAPTCHA=off a form needs no captcha: 201", plain.status === 201, JSON.stringify(plain));
  await down();

  // ---- with the key and the captcha on
  await up();
  const c1 = await submit("complaints", complaint);
  check("a visitor's complaint is accepted: 201 with a reference number", c1.status === 201 && /^DGA-CMP-\d{4}-\d{6}$/.test(c1.json.data.ref), JSON.stringify(c1));
  const beYear = new Date().getUTCFullYear() + 543;
  check("the reference carries the Buddhist-era year", c1.json.data.ref.startsWith(`DGA-CMP-${beYear}-`), c1.json.data.ref);
  check("the answer holds the reference and times only, no personal data", Object.keys(c1.json.data).sort().join() === "createdAt,documentId,ref", JSON.stringify(c1.json.data));
  const row = await read("complaint", c1.json.data.documentId);
  check("Studio reads it with the personal data decrypted", row.name === complaint.name && row.email === complaint.email && row.phone === complaint.phone && row.subject === complaint.subject && row.detail === complaint.detail, JSON.stringify(row));
  check("it is filed under the workspace in the URL, at stage 0", row.tenantKey === "pea" && row.stage === 0 && row.ref === c1.json.data.ref && row.anonymous === false, JSON.stringify(row));

  // what the server owns
  const forged = await submit("complaints", { subject: "forged", stage: 5, ref: "FORGED-1", steps: [{ x: 1 }], tenantKey: "dga", attachment: "x" });
  const fr = await read("complaint", forged.json.data.documentId);
  check("a visitor cannot set the stage, the reference, the steps or the workspace", fr.stage === 0 && fr.ref !== "FORGED-1" && /^DGA-CMP-/.test(fr.ref) && fr.steps === undefined && fr.tenantKey === "pea" && fr.attachment === undefined, JSON.stringify(fr));
  const anon = await submit("complaints", { ...complaint, anonymous: true });
  const ar = await read("complaint", anon.json.data.documentId);
  check("an anonymous complaint carries no one's details", ar.anonymous === true && ar.name === "" && ar.email === "" && ar.phone === "", JSON.stringify(ar));

  // applications, registrations, contact messages
  const app = await submit("applications", { position: "นักพัฒนา", jobId: "J-7", name: "นก", email: "nok@example.com", phone: "0899999999", note: "n", date: "25/11/2569" });
  check("an application's reference starts DGA-JOB", app.status === 201 && /^DGA-JOB-\d{4}-\d{6}$/.test(app.json.data.ref), JSON.stringify(app));
  const reg = await submit("registrations", { utype: "ประชาชน", firstname: "นก", lastname: "ใจดี", email: "nok.j@example.com", phone: "0811111111", verified: true, password: "hunter2", nidMasked: "1-2345-xxxxx-xx-1" });
  check("a registration answers with its username", reg.status === 201 && /^nok\.j\d{4}$/.test(reg.json.data.username), JSON.stringify(reg));
  const rr = await read("registration", reg.json.data.documentId);
  check("it is stored unverified whatever was sent, with no password, personal data readable by Studio", rr.verified === false && rr.password === undefined && rr.firstname === "นก" && rr.lastname === "ใจดี" && rr.email === "nok.j@example.com" && rr.nidMasked === "1-2345-xxxxx-xx-1", JSON.stringify(rr));
  const msg = await submit("contact-messages", { name: "ผู้ติดต่อ", email: "c@example.com", subject: "s", message: "ข้อความ", handled: true });
  const mr = await read("contact-message", msg.json.data.documentId);
  check("a contact message is stored unhandled; its answer has no reference", msg.status === 201 && msg.json.data.ref === undefined && mr.handled === false && mr.name === "ผู้ติดต่อ" && mr.message === "ข้อความ", JSON.stringify([msg.json, mr]));

  // ---- tracking
  const t = await track("complaints", c1.json.data.ref.toLowerCase());
  check("a citizen tracks by reference number alone (any case)", t.status === 200 && t.json.data.ref === c1.json.data.ref && t.json.data.subject === complaint.subject && t.json.data.stage === 0 && t.json.data.type === complaint.type, JSON.stringify(t));
  check("tracking shows no personal data and no detail", !["name", "email", "phone", "detail", "documentId", "tenantKey"].some((k) => k in t.json.data), JSON.stringify(t.json.data));
  check("another workspace cannot track it: 404", (await track("complaints", c1.json.data.ref, "dga")).status === 404);
  check("an unknown reference: 404 NotFoundError", (await track("complaints", "DGA-CMP-2569-000000")).json?.error?.name === "NotFoundError");
  check("a complaint's reference is not an application's: 404", (await track("applications", c1.json.data.ref)).status === 404);
  const ta = await track("applications", app.json.data.ref);
  check("an application is tracked with its own fields", ta.status === 200 && ta.json.data.position === "นักพัฒนา" && ta.json.data.jobId === "J-7" && ta.json.data.stage === 0 && ta.json.data.name === undefined, JSON.stringify(ta));

  // ---- the captcha
  const noCaptcha = await call("POST", "/api/complaints?tenant=pea", { body: { data: complaint }, headers: { "x-forwarded-for": ip() } });
  check("a form without a captcha is refused: 400 CaptchaError", noCaptcha.status === 400 && noCaptcha.json.error.name === "CaptchaError", JSON.stringify(noCaptcha));
  const good = await solved();
  const wrong = await submit("complaints", complaint, { captcha: { captchaId: good.captchaId, captchaAnswer: "99" } });
  check("a wrong answer: 400 CaptchaError", wrong.status === 400 && wrong.json.error.name === "CaptchaError");
  check("and the challenge is used up, so the right answer no longer works", (await submit("complaints", complaint, { captcha: good })).status === 400);
  const once = await solved();
  check("a right answer works once", (await submit("complaints", complaint, { captcha: once })).status === 201);
  check("and not twice", (await submit("complaints", complaint, { captcha: once })).status === 400);
  check("a captcha id that was never issued: 400", (await submit("complaints", complaint, { captcha: { captchaId: "0".repeat(18), captchaAnswer: "5" } })).status === 400);

  // ---- bad input
  check("a malformed e-mail address: 400", (await submit("complaints", { ...complaint, email: "nobody" })).status === 400);
  check("a contact message without its message: 400", (await submit("contact-messages", { name: "N" })).status === 400);
  check("a field of the wrong type: 400", (await submit("complaints", { subject: 5 })).status === 400);
  check("a body that is not JSON: 400", (await call("POST", "/api/complaints?tenant=pea", { body: "nope", headers: { "x-forwarded-for": ip() } })).status === 400);
  check("a body past 64 KB is refused: 413", (await call("POST", "/api/complaints?tenant=pea", { body: { data: { detail: "x".repeat(70_000) } }, headers: { "x-forwarded-for": ip() } })).status === 413);
  check("long text is cut at its limit", (await read("complaint", (await submit("complaints", { detail: "ก".repeat(12_000) })).json.data.documentId)).detail.length === 10_000);
  check("an unregistered workspace is filed under the first, as Strapi does", (await read("complaint", (await submit("complaints", { subject: "stranger" }, { tenant: "nobody" })).json.data.documentId)).tenantKey === "dga");

  // ---- Studio's records API: edit, create, import, filter
  const upd = await admin("PUT", `complaint/${c1.json.data.documentId}`, { data: { stage: 2, steps: [{ at: "2026-11-26", note: "รับเรื่อง" }], name: "สมชาย แก้ไข" } });
  check("an editor moves a complaint on and changes a name; the answer is decrypted", upd.status === 200 && upd.json.data.stage === 2 && upd.json.data.name === "สมชาย แก้ไข" && upd.json.data.email === complaint.email, JSON.stringify(upd));
  const t2 = await track("complaints", c1.json.data.ref);
  check("the citizen then sees the new stage and steps", t2.json.data.stage === 2 && t2.json.data.steps[0].note === "รับเรื่อง", JSON.stringify(t2.json));
  const made = await admin("POST", "complaint", { data: { tenantKey: "pea", subject: "by an editor", name: "Plain Name", email: "p@example.com" } });
  check("a complaint made through the records API gets a reference and a stage, and is read back decrypted", made.status === 200 && /^DGA-CMP-/.test(made.json.data.ref) && made.json.data.stage === 0 && made.json.data.name === "Plain Name", JSON.stringify(made));
  check("a form collection cannot be filtered on personal data: 400", (await admin("GET", "complaint?filter=" + encodeURIComponent("name:eq:Plain Name"))).status === 400);
  const list = await admin("GET", `complaint?pageSize=100&sort=createdAt:DESC&filter=${encodeURIComponent("tenantKey:eq:pea")}`);
  check("the list is readable and decrypted, filtered by workspace", list.status === 200 && list.json.data.length >= 4 && list.json.data.every((r) => r.tenantKey === "pea") && list.json.data.some((r) => r.name === "Plain Name"), JSON.stringify(list.json).slice(0, 200));
  const bySubject = await admin("GET", `complaint?filter=${encodeURIComponent("subject:eq:ขอตรวจสอบ")}`);
  check("fields that are not personal data can be filtered", bySubject.status === 200 && bySubject.json.data.some((r) => r.ref === c1.json.data.ref));

  const imported = await admin("POST", "complaint/import", [
    { documentId: "mig00000000000000000001", tenantKey: "pea", ref: "DGA-CMP-2568-424242", subject: "old, plain", name: "Plain Old", stage: 1, createdAt: "2025-01-02T03:04:05.000Z" },
    { documentId: "mig00000000000000000002", tenantKey: "pea", ref: "DGA-CMP-2568-424243", subject: "old, as Strapi stored it", email: NODE_CIPHERTEXT, createdAt: "2025-01-03T03:04:05.000Z" },
  ]);
  check("an import adds rows with their own ids and times", imported.json.added === 2 && imported.json.skipped === 0, JSON.stringify(imported.json));
  check("run again it skips them", (await admin("POST", "complaint/import", [{ documentId: "mig00000000000000000001", tenantKey: "pea" }])).json.skipped === 1);
  const m1 = await read("complaint", "mig00000000000000000001"), m2 = await read("complaint", "mig00000000000000000002");
  check("plain text from before encryption existed is encrypted on import and read back", m1.name === "Plain Old" && m1.stage === 1 && m1.createdAt === "2025-01-02T03:04:05.000Z", JSON.stringify(m1));
  check("a value Strapi's Node code encrypted under the same key is kept and reads back", m2.email === "somchai@example.com", JSON.stringify(m2));
  check("an imported reference can be tracked", (await track("complaints", "DGA-CMP-2568-424242")).json?.data?.subject === "old, plain");

  // ---- allowances
  let limited = 0;
  const same = ip();
  for (let k = 0; k < 40; k++) if ((await call("POST", "/api/contact-messages?tenant=pea", { body: { data: { name: "N", message: "m" } }, headers: { "x-forwarded-for": same } })).status === 429) limited++;
  check("an address that posts 40 forms in a minute is rate-limited after 30: 429", limited === 10, `limited ${limited}`);
  let trackLimited = 0;
  const trackIp = ip();
  for (let k = 0; k < 40; k++) if ((await track("complaints", "DGA-CMP-2569-000001", "pea", trackIp)).status === 429) trackLimited++;
  check("tracking has its own allowance: 429 after 30", trackLimited === 10, `limited ${trackLimited}`);
  check("the form allowance of that address is separate from tracking's", (await call("POST", "/api/contact-messages?tenant=pea", { body: { data: { name: "N", message: "m" } }, headers: { "x-forwarded-for": trackIp } })).status === 400, "a post with no captcha is a 400, not a 429");

  // ---- the browser's preflight
  check("a browser on the public site may post a form: preflight answered", (await call("OPTIONS", "/api/complaints?tenant=pea", { headers: { origin: "http://localhost:3100", "access-control-request-method": "POST" } })).headers["access-control-allow-origin"] === "http://localhost:3100");

  // ---- the same rows after a restart, and with the wrong key
  await down();
  await up();
  check("the rows are still there after a restart, readable with the same key", (await read("complaint", c1.json.data.documentId))?.name === "สมชาย แก้ไข");
  await down();
  await up([], { WEBX_PII_KEY: OTHER_KEY });
  const bad = await admin("GET", `complaint/${c1.json.data.documentId}`);
  check("with a different key the personal data is unreadable, and it says which field: 500 PiiError", bad.status === 500 && bad.json.error.name === "PiiError" && /^(name|email|phone): /.test(bad.json.error.message), JSON.stringify(bad.json));
  check("so it really is stored encrypted", !JSON.stringify(bad.json).includes("somchai"));
  check("what is not personal data stays readable without the key", (await call("GET", `/api/complaints/track/${c1.json.data.ref}?tenant=pea`, { headers: { "x-forwarded-for": ip() } })).json.data.subject === complaint.subject);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (server) { try { await down(); } catch {} }
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control forms: all checks passed");
process.exit(failures ? 1 : 0);
