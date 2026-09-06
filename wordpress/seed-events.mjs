// One-off migration: creates sample `event` CPT rows for both ORST and
// RoyalSociety tenants, so the "ปฏิทินกิจกรรม" block (news.json's "calendar"
// block / activities.json's "activities-calendar" block — see
// components/EventCalendar.tsx) has real data instead of an empty calendar.
// Same placeholder-quality bar as seed-royalsociety-documents.mjs (real
// dates spread across "today" and upcoming weeks so the calendar's own
// "jump to nearest upcoming event" default has something to show — not a
// claim these are real scheduled events).
//
// Safe to re-run: UPDATEs an event that already exists by title (matched
// within that tenant's wtenant scope), same idempotency convention as
// seed-royalsociety-documents.mjs.
//
// Usage: node wordpress/seed-events.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(repoRoot, "webx-studio", ".env.local");
  const out = {};
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {}
  return out;
}

const envFile = loadEnvLocal();
const WORDPRESS_URL = (process.env.WORDPRESS_URL || envFile.WORDPRESS_URL || "http://localhost:8081/wp-json").replace(/\/$/, "");
const WP_USER = process.env.WORDPRESS_SCHEDULER_USERNAME || envFile.WORDPRESS_SCHEDULER_USERNAME;
const WP_PASS = process.env.WORDPRESS_SCHEDULER_APP_PASSWORD || envFile.WORDPRESS_SCHEDULER_APP_PASSWORD;
if (!WP_USER || !WP_PASS) {
  console.error("Missing WORDPRESS_SCHEDULER_USERNAME / WORDPRESS_SCHEDULER_APP_PASSWORD (checked env and webx-studio/.env.local)");
  process.exit(1);
}
const AUTH = "Basic " + Buffer.from(WP_USER + ":" + WP_PASS).toString("base64");

async function req(reqPath, opts = {}) {
  const r = await fetch(WORDPRESS_URL + reqPath, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: AUTH, ...(opts.headers || {}) },
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) throw new Error(reqPath + " -> " + r.status + ": " + (body.message || text).slice(0, 300));
  return body;
}

async function wtenantId(key) {
  const terms = await req("/wp/v2/wtenant?per_page=100");
  const t = terms.find((x) => x.slug === key);
  if (!t) throw new Error('No wtenant term found for "' + key + '"');
  return t.id;
}

const EVENTS = {
  orst: [
    { title: "ประชุมคณะกรรมการประจำเดือน", date: "2026-09-05", time: "09:00 - 12:00 น.", location: "ห้องประชุมใหญ่ สำนักงานราชบัณฑิตยสภา", category: "ประชุม" },
    { title: "บรรยายวิชาการสาธารณะ: ภาษาไทยในยุคดิจิทัล", date: "2026-09-12", time: "13:30 - 16:00 น.", location: "หอประชุม", category: "บรรยาย" },
    { title: "นิทรรศการเผยแพร่องค์ความรู้ด้านภาษาไทย", date: "2026-09-12", time: "ตลอดวัน", location: "ลานกิจกรรม", category: "นิทรรศการ" },
    { title: "สัมมนาเชิงปฏิบัติการศัพท์บัญญัติ", date: "2026-09-20", time: "09:00 - 16:00 น.", location: "ห้องสัมมนา", category: "สัมมนา" },
    { title: "การประชุมใหญ่สามัญประจำปี", date: "2026-10-03", time: "09:00 - 12:00 น.", location: "ห้องประชุมใหญ่", category: "ประชุม" },
    { title: "กิจกรรมวันภาษาไทยแห่งชาติ", date: "2026-10-15", time: "ตลอดวัน", location: "ลานอเนกประสงค์", category: "กิจกรรมสาธารณะ" },
  ],
  royalsociety: [
    { title: "ประชุมสภาราชบัณฑิตประจำเดือน", date: "2026-09-06", time: "09:30 - 12:00 น.", location: "ห้องประชุมราชบัณฑิตยสภา", category: "ประชุม" },
    { title: "ปาฐกถาพิเศษ: องค์ความรู้เพื่อสังคมไทย", date: "2026-09-14", time: "13:00 - 15:30 น.", location: "หอประชุมใหญ่", category: "ปาฐกถา" },
    { title: "งานเสวนาวิชาการสำหรับเยาวชน", date: "2026-09-14", time: "ตลอดวัน", location: "ลานกิจกรรม", category: "เสวนา" },
    { title: "อบรมเชิงปฏิบัติการเผยแพร่ความรู้", date: "2026-09-22", time: "09:00 - 16:00 น.", location: "ห้องอบรม", category: "อบรม" },
    { title: "ประชุมใหญ่สามัญประจำปี ราชบัณฑิตยสภา", date: "2026-10-05", time: "09:00 - 12:00 น.", location: "ห้องประชุมใหญ่", category: "ประชุม" },
    { title: "งานวันคล้ายวันสถาปนาราชบัณฑิตยสภา", date: "2026-10-18", time: "ตลอดวัน", location: "หอประชุมใหญ่", category: "กิจกรรมสาธารณะ" },
  ],
};

async function findByTitle(title, tenantTermId) {
  const rows = await req("/wp/v2/event?wtenant=" + tenantTermId + "&search=" + encodeURIComponent(title) + "&per_page=10");
  return rows.find((r) => r.title?.rendered === title) || null;
}

async function main() {
  for (const [tenant, events] of Object.entries(EVENTS)) {
    const tenantTermId = await wtenantId(tenant);
    console.log(tenant + " wtenant term id:", tenantTermId);
    for (const ev of events) {
      const existing = await findByTitle(ev.title, tenantTermId);
      const payload = {
        title: ev.title, status: "publish", wtenant: [tenantTermId],
        acf: { event_date: ev.date.replace(/-/g, ""), event_time: ev.time, location: ev.location, category: ev.category },
      };
      if (existing) {
        await req("/wp/v2/event/" + existing.id, { method: "POST", body: JSON.stringify(payload) });
        console.log(tenant, "updated", ev.title, "(id " + existing.id + ")");
      } else {
        const created = await req("/wp/v2/event", { method: "POST", body: JSON.stringify(payload) });
        console.log(tenant, "created", ev.title, "(id " + created.id + ")");
      }
    }
  }
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
