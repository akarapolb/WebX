// One-off migration: import RoyalSociety's hardcoded top-nav (Header.tsx's
// former NAV + MEGA constants) into api::menu-item.menu-item — the
// RoyalSociety sibling of seed-orst-nav.mjs (same mechanism, same
// reasoning; see that file's own header comment for the full rationale).
//
// Every link within a MEGA group pointed at the SAME page (item.href) in
// the original source — RS's config never assigned distinct per-link URLs
// (unlike ORST's, which did) — so every migrated link below reuses that
// page's own URL too, preserving current behavior exactly. `royalsociety`
// tenant may or may not already have placeholder flat rows from
// strapi-cms's seedFlatNavItems bootstrap seed; this script wipes whatever
// flat (column-blank) rows it finds and recreates the real 7-item set, same
// safe-to-re-run caveat as seed-orst-nav.mjs.
//
// Usage: node strapi-cms/seed-royalsociety-nav.mjs
// Reads STRAPI_URL / STRAPI_SCHEDULER_EMAIL / STRAPI_SCHEDULER_PASSWORD from
// webx-studio/.env.local, or from the environment if set.

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
const STRAPI_URL = (process.env.STRAPI_URL || envFile.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const EMAIL = process.env.STRAPI_SCHEDULER_EMAIL || envFile.STRAPI_SCHEDULER_EMAIL;
const PASSWORD = process.env.STRAPI_SCHEDULER_PASSWORD || envFile.STRAPI_SCHEDULER_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Missing STRAPI_SCHEDULER_EMAIL / STRAPI_SCHEDULER_PASSWORD (checked env and webx-studio/.env.local)");
  process.exit(1);
}

const UID = "api::menu-item.menu-item";
const TENANT_UID = "api::tenant.tenant";

async function req(url, token, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(opts.headers || {}) },
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) throw new Error(url + " -> " + r.status + ": " + JSON.stringify(body).slice(0, 300));
  return body;
}

function ctUrl(uid, id, suffix) {
  let url = STRAPI_URL + "/content-manager/collection-types/" + uid;
  if (id) url += "/" + id;
  if (suffix) url += "/" + suffix;
  return url;
}

function linksFor(href, texts) {
  return texts.map((text) => ({ text, url: href }));
}

// Verbatim from public-site/templates/royalsociety/Header.tsx's former NAV
// + MEGA constants, before that file was switched to read from CMS.
const NAV_ITEMS = [
  { key: "home", label: "หน้าหลัก", url: "/royalsociety" },
  { key: "about", label: "เกี่ยวกับราชบัณฑิตยสภา", url: "/royalsociety/about" },
  { key: "knowledge", label: "องค์ความรู้", url: "/royalsociety/knowledge" },
  { key: "activities", label: "งานวิชาการและกิจกรรม", url: "/royalsociety/activities" },
  { key: "publications", label: "สื่อและสิ่งพิมพ์", url: "/royalsociety/publications" },
  { key: "services", label: "บริการประชาชน", url: "/royalsociety/services" },
  { key: "contact", label: "ติดต่อเรา", url: "/royalsociety/contact" },
];

const MEGA = {
  about: {
    eyebrow: "Institution", title: "เกี่ยวกับราชบัณฑิตยสภา",
    description: "ทำความรู้จักประวัติ บทบาท โครงสร้าง และบุคลากรของราชบัณฑิตยสภา",
    featuredLabel: "ดูข้อมูลทั้งหมด", featuredUrl: "/royalsociety/about",
    groups: [
      { heading: "ข้อมูลองค์กร", links: linksFor("/royalsociety/about", ["ประวัติความเป็นมา", "ผู้บริหาร", "ราชบัณฑิตและภาคีสมาชิก", "โครงสร้างองค์กร"]) },
      { heading: "สำนักและระเบียบ", links: linksFor("/royalsociety/about", ["สำนักธรรมศาสตร์และการเมือง", "สำนักวิทยาศาสตร์", "สำนักศิลปกรรม", "กฎ ระเบียบ และข้อบังคับ"]) },
    ],
  },
  knowledge: {
    eyebrow: "Knowledge", title: "องค์ความรู้",
    description: "ค้นหาคลังความรู้ คำศัพท์ บทความ สารานุกรม และฐานข้อมูลวิชาการ",
    featuredLabel: "สำรวจองค์ความรู้", featuredUrl: "/royalsociety/knowledge",
    groups: [
      { heading: "ค้นคว้าและฐานข้อมูล", links: linksFor("/royalsociety/knowledge", ["คลังองค์ความรู้", "พจนานุกรมและคำศัพท์", "สารานุกรม", "ฐานข้อมูลวิชาการ"]) },
      { heading: "เนื้อหาแนะนำ", links: linksFor("/royalsociety/knowledge", ["บทความวิชาการ", "องค์ความรู้สำหรับประชาชน", "ภาษาไทย", "ศิลปกรรมและวัฒนธรรม"]) },
    ],
  },
  activities: {
    eyebrow: "Academic Activities", title: "งานวิชาการและกิจกรรม",
    description: "ติดตามโครงการ การประชุม บรรยายวิชาการ และข่าวกิจกรรมล่าสุด",
    featuredLabel: "ดูงานวิชาการทั้งหมด", featuredUrl: "/royalsociety/activities",
    groups: [
      { heading: "งานวิชาการ", links: linksFor("/royalsociety/activities", ["โครงการและกิจกรรม", "การประชุมวิชาการ", "บรรยายวิชาการ", "รายงานประจำปี"]) },
      { heading: "ข่าวและประกาศ", links: linksFor("/royalsociety/activities", ["ข่าวกิจกรรม", "ประกาศ", "ปฏิทินกิจกรรม", "กิจกรรมเผยแพร่ความรู้"]) },
    ],
  },
  publications: {
    eyebrow: "Media & Publications", title: "สื่อและสิ่งพิมพ์",
    description: "เลือกอ่าน ดาวน์โหลด และรับชมสื่อความรู้จากราชบัณฑิตยสภา",
    featuredLabel: "ดูสื่อทั้งหมด", featuredUrl: "/royalsociety/publications",
    groups: [
      { heading: "สิ่งพิมพ์", links: linksFor("/royalsociety/publications", ["E-Book", "หนังสือและตำรา", "วารสารราชบัณฑิตยสภา", "คลังเอกสาร"]) },
      { heading: "สื่อดิจิทัล", links: linksFor("/royalsociety/publications", ["Infographic", "สื่อวิดีโอ", "สื่อเสียง", "เอกสารดาวน์โหลด"]) },
    ],
  },
  services: {
    eyebrow: "Public Services", title: "บริการประชาชน",
    description: "รวมช่องทางบริการและข้อมูลสำหรับประชาชน หน่วยงาน และผู้ใช้บริการทั่วไป",
    featuredLabel: "เริ่มใช้บริการ", featuredUrl: "/royalsociety/services",
    groups: [
      { heading: "บริการหลัก", links: linksFor("/royalsociety/services", ["สอบถามข้อมูลทางวิชาการ", "ขออนุญาตใช้เนื้อหา", "ดาวน์โหลดแบบฟอร์ม", "งานบริการออนไลน์"]) },
      { heading: "ช่องทางสนับสนุน", links: linksFor("/royalsociety/services", ["ติดต่อราชการ", "คำถามที่พบบ่อย", "รับข้อเสนอแนะ", "คู่มือการใช้งาน"]) },
    ],
  },
};

async function main() {
  const loginRes = await fetch(STRAPI_URL + "/admin/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) throw new Error("admin/login -> " + loginRes.status);
  const login = await loginRes.json();
  const token = login?.data?.token;
  if (!token) throw new Error("admin/login did not return a token");

  const tenants = await req(ctUrl(TENANT_UID) + "?filters[key][$eq]=royalsociety", token);
  const tenantRow = (tenants.results ?? tenants.data ?? [])[0];
  if (!tenantRow) throw new Error('No tenant found for key "royalsociety"');
  const tenantId = tenantRow.id;
  console.log("royalsociety tenant id:", tenantId);

  const existing = await req(ctUrl(UID) + "?filters[tenant][id][$eq]=" + tenantId + "&pageSize=100", token);
  const rows = existing.results ?? existing.data ?? [];
  const flat = rows.filter((r) => !r.column);
  for (const r of flat) {
    await req(ctUrl(UID, r.documentId), token, { method: "DELETE" });
    console.log("deleted placeholder flat nav row", r.documentId, JSON.stringify(r.label));
  }

  let order = 1;
  for (const item of NAV_ITEMS) {
    const megaMenu = MEGA[item.key] || null;
    const created = await req(ctUrl(UID), token, {
      method: "POST",
      body: JSON.stringify({ label: item.label, url: item.url, order: order++, openNewTab: false, tenant: tenantId, megaMenu }),
    });
    const docId = created?.data?.documentId ?? created?.documentId;
    await req(ctUrl(UID, docId, "actions/publish"), token, { method: "POST", body: "{}" });
    console.log("created + published", item.key, docId, megaMenu ? "(with mega menu)" : "");
  }
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
