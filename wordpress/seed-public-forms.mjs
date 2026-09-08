// One-off migration: seeds the real starting content for Phase 7's native
// WordPress subsystems (poll, job postings) so a fresh clone + fresh
// WordPress install has the same real data this project ships with, instead
// of an empty poll block on ORST's homepage and an empty careers page on
// both tenants (see templates/orst/PollBlock.tsx / components/
// JobApplicationForm.tsx — both render nothing/"no openings" with no data
// behind them).
//
// complaint / application / contact_message / breaking_news are
// deliberately NOT seeded here — those are citizen-submitted or
// admin-authored transactional data (see public-forms-post-types.php),
// there is no "real starting value" for a complaint the way there is for a
// poll question or a job posting.
//
// The poll question/options and the 4 job postings below are the real
// content this project has used throughout — the poll was originally a
// Strapi api::poll.poll row, the jobs were originally Strapi api::job.job
// rows (see strapi-cms/src/seed/seed.ts's seedOrstRoyalSocietyJobs for the
// Strapi-side originals DGA/PEA still use) — copied here verbatim as part
// of migrating these two tenants off Strapi for these features.
//
// Safe to re-run: jobs are UPDATEd if a row with the same jobId already
// exists in that tenant's wtenant scope, same idempotency convention as
// seed-members.mjs. The poll is handled more carefully: on an existing
// poll (matched by title), only `question`/`active` are refreshed —
// `options`/`total_votes` are deliberately left untouched so re-running
// this script against a live environment never resets real accumulated
// votes back to zero. ORST's homepage poll block is re-wired to the real
// poll's id every run, matching seed-event-calendar-blocks.mjs's own
// block-wiring convention.
//
// Usage: node wordpress/seed-public-forms.mjs

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

// ---------------------------------------------------------------- poll ----
const POLL_TITLE = "แบบสำรวจความพึงพอใจเว็บไซต์";
const POLL = {
  question: "ท่านพึงพอใจกับเว็บไซต์และช่องทางการเข้าถึงข้อมูลของสำนักงานราชบัณฑิตยสภาเพียงใด?",
  options: [
    { label: "พึงพอใจมาก", votes: 0 },
    { label: "พึงพอใจปานกลาง", votes: 0 },
    { label: "ควรปรับปรุง", votes: 0 },
  ],
};

async function seedPoll() {
  const tenantTermId = await wtenantId("orst");
  const rows = await req("/wp/v2/poll?wtenant=" + tenantTermId + "&search=" + encodeURIComponent(POLL_TITLE) + "&per_page=10");
  const existing = rows.find((r) => r.title?.rendered === POLL_TITLE) || null;

  let pollId;
  if (existing) {
    // Deliberately NOT touching acf.options/total_votes here — a real poll
    // may have real accumulated votes by the time this is re-run, and
    // resetting them would be a genuine data-loss bug, not idempotency.
    await req("/wp/v2/poll/" + existing.id, {
      method: "POST",
      body: JSON.stringify({ acf: { question: POLL.question, active: true } }),
    });
    pollId = existing.id;
    console.log("poll: updated question on existing poll (id " + pollId + "), left vote counts untouched");
  } else {
    const created = await req("/wp/v2/poll", {
      method: "POST",
      body: JSON.stringify({
        title: POLL_TITLE, status: "publish", wtenant: [tenantTermId],
        acf: { question: POLL.question, options: JSON.stringify(POLL.options), active: true, total_votes: 0 },
      }),
    });
    pollId = created.id;
    console.log("poll: created (id " + pollId + ")");
  }
  return pollId;
}

async function wirePollBlock(pollId) {
  const rows = await req("/wp/v2/pages?slug=orst-home&status=publish,draft,pending,future&per_page=5&context=edit");
  const page = rows[0];
  if (!page) { console.warn('poll: "orst-home" page not found — skipping block wiring'); return; }
  const blocks = JSON.parse(page.acf.blocks || "[]");
  const idx = blocks.findIndex((b) => b.type === "poll");
  if (idx === -1) { console.warn("poll: no poll block found on orst-home — skipping block wiring"); return; }
  if (blocks[idx].pollId === String(pollId)) { console.log("poll: homepage block already points at id " + pollId); return; }
  blocks[idx] = { ...blocks[idx], pollId: String(pollId) };
  await req("/wp/v2/pages/" + page.id, { method: "POST", body: JSON.stringify({ acf: { blocks: JSON.stringify(blocks) } }) });
  console.log("poll: wired orst-home's poll block to id " + pollId);
}

// ---------------------------------------------------------------- jobs ----
const JOBS = {
  orst: [
    {
      jobId: "orst-thai-lang-officer", deptKey: "corporate", typeKey: "fulltime", openings: 1,
      title: "นักวิชาการภาษาไทย", dept: "สำนักงานราชบัณฑิตยสภา", type: "พนักงานราชการ",
      location: "กรุงเทพมหานคร", salary: "18,000–25,000 บาท/เดือน", deadline: "30 ก.ย. 2569",
      summary: "ปฏิบัติงานด้านการบัญญัติศัพท์ ตรวจสอบและจัดทำพจนานุกรม และสนับสนุนงานวิชาการด้านภาษาไทย",
      responsibilities: ["จัดทำและปรับปรุงพจนานุกรมและศัพท์บัญญัติ", "ตอบข้อซักถามด้านภาษาไทยจากประชาชนและหน่วยงาน", "สนับสนุนงานประชุมวิชาการของราชบัณฑิตยสภา"],
      qualifications: ["ปริญญาตรีสาขาภาษาไทยหรือที่เกี่ยวข้อง", "มีความรู้ด้านหลักภาษาไทยเป็นอย่างดี", "สามารถทำงานเอกสารวิชาการได้"],
      benefits: ["สิทธิประกันสังคม", "ค่าตอบแทนพิเศษตามระเบียบราชการ", "วันลาตามสิทธิราชการ"],
    },
    {
      jobId: "orst-it-officer", deptKey: "tech", typeKey: "fulltime", openings: 1,
      title: "นักวิชาการคอมพิวเตอร์", dept: "ฝ่ายเทคโนโลยีสารสนเทศ", type: "พนักงานราชการ",
      location: "กรุงเทพมหานคร", salary: "19,500–27,000 บาท/เดือน", deadline: "30 ก.ย. 2569",
      summary: "ดูแลระบบสารสนเทศและเว็บไซต์ของสำนักงาน สนับสนุนการให้บริการดิจิทัลแก่ประชาชน",
      responsibilities: ["ดูแลและพัฒนาระบบสารสนเทศของสำนักงาน", "สนับสนุนการให้บริการออนไลน์แก่ประชาชน", "ประสานงานด้านความมั่นคงปลอดภัยไซเบอร์"],
      qualifications: ["ปริญญาตรีด้านคอมพิวเตอร์หรือที่เกี่ยวข้อง", "มีความรู้ด้านเว็บและฐานข้อมูล", "สามารถทำงานเป็นทีมได้"],
      benefits: ["สิทธิประกันสังคม", "ค่าตอบแทนพิเศษตามระเบียบราชการ", "วันลาตามสิทธิราชการ"],
    },
  ],
  royalsociety: [
    {
      jobId: "rs-editorial-officer", deptKey: "corporate", typeKey: "fulltime", openings: 1,
      title: "เจ้าหน้าที่บรรณาธิการ", dept: "ฝ่ายเผยแพร่และสิ่งพิมพ์", type: "พนักงานราชการ",
      location: "กรุงเทพมหานคร", salary: "18,000–25,000 บาท/เดือน", deadline: "30 ก.ย. 2569",
      summary: "ตรวจทาน เรียบเรียง และจัดทำต้นฉบับสิ่งพิมพ์และวารสารวิชาการของราชบัณฑิตยสภา",
      responsibilities: ["ตรวจทานและเรียบเรียงต้นฉบับก่อนเผยแพร่", "ประสานงานกับผู้ทรงคุณวุฒิด้านเนื้อหา", "จัดทำสิ่งพิมพ์และวารสารตามกำหนดการ"],
      qualifications: ["ปริญญาตรีทุกสาขา", "มีทักษะการเขียนและตรวจทานภาษาไทยที่ดี", "ละเอียดรอบคอบ"],
      benefits: ["สิทธิประกันสังคม", "ค่าตอบแทนพิเศษตามระเบียบราชการ", "วันลาตามสิทธิราชการ"],
    },
    {
      jobId: "rs-research-assistant", deptKey: "corporate", typeKey: "contract", openings: 2,
      title: "ผู้ช่วยนักวิจัย", dept: "สำนักวิชาการ", type: "จ้างเหมาบริการ",
      location: "กรุงเทพมหานคร", salary: "16,000–20,000 บาท/เดือน", deadline: "30 ก.ย. 2569",
      summary: "สนับสนุนงานค้นคว้าและรวบรวมข้อมูลวิชาการให้แก่ราชบัณฑิตและภาคีสมาชิก",
      responsibilities: ["สืบค้นและรวบรวมข้อมูลวิชาการ", "จัดเตรียมเอกสารประกอบการประชุมวิชาการ", "สนับสนุนงานธุรการของสำนักวิชาการ"],
      qualifications: ["ปริญญาตรีทุกสาขา", "สามารถค้นคว้าข้อมูลอย่างเป็นระบบ", "ใช้โปรแกรมสำนักงานได้ดี"],
      benefits: ["สิทธิประกันสังคม", "ค่าตอบแทนตามสัญญาจ้าง"],
    },
  ],
};

async function findJobByJobId(jobId, tenantTermId) {
  const rows = await req("/wp/v2/job?wtenant=" + tenantTermId + "&per_page=50&context=edit");
  return rows.find((r) => r.acf?.jobId === jobId) || null;
}

async function seedJobs() {
  for (const [tenant, rows] of Object.entries(JOBS)) {
    const tenantTermId = await wtenantId(tenant);
    for (const j of rows) {
      const existing = await findJobByJobId(j.jobId, tenantTermId);
      const payload = {
        title: j.title, status: "publish", wtenant: [tenantTermId],
        acf: {
          jobId: j.jobId, deptKey: j.deptKey, typeKey: j.typeKey, openings: j.openings,
          dept: j.dept, type: j.type, location: j.location, salary: j.salary, deadline: j.deadline,
          summary: j.summary,
          responsibilities: JSON.stringify(j.responsibilities),
          qualifications: JSON.stringify(j.qualifications),
          benefits: JSON.stringify(j.benefits),
        },
      };
      if (existing) {
        await req("/wp/v2/job/" + existing.id, { method: "POST", body: JSON.stringify(payload) });
        console.log(tenant, "job: updated", j.title, "(id " + existing.id + ")");
      } else {
        const created = await req("/wp/v2/job", { method: "POST", body: JSON.stringify(payload) });
        console.log(tenant, "job: created", j.title, "(id " + created.id + ")");
      }
    }
  }
}

async function main() {
  const pollId = await seedPoll();
  await wirePollBlock(pollId);
  await seedJobs();
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
