// One-off migration: import ORST's hardcoded top-nav (Header.tsx's navItems +
// megaMenuData) into api::menu-item.menu-item — the same content type
// NavManager.tsx (webx-studio, Branding > Navigation) already manages for
// every gov-portal tenant, now extended with a `megaMenu` JSON field. See
// wordpress/seed-orst-layout.mjs for the page-*layout* migration this
// mirrors; this one migrates *navigation*, which is a bookkeeping concern
// (menu-item is a BOOKKEEPING_UID — see governance.ts) and so always lives
// in Strapi regardless of a tenant's content engine, WordPress included.
//
// The `orst` tenant already had 5 flat nav rows from strapi-cms's own
// seedFlatNavItems() bootstrap seed — that function seeds a generic
// gov-portal-flavored placeholder set (labels like "บริการ" -> "#services")
// for every tenant with zero flat rows, purely so the top nav isn't blank.
// It is not ORST's real nav. This script deletes those placeholder rows for
// orst and replaces them with the real 8-item nav (with 6 mega-menu
// dropdowns), read verbatim from the pre-migration Header.tsx.
//
// Safe to re-run: always wipes orst's current flat (column-blank) rows and
// recreates the full set, so re-running after a hand-edit in NavManager
// would discard that edit — same caveat as seed-orst-layout.mjs's re-run
// note. Talks to Strapi's admin content-manager API (not the public /api
// REST API) using the scheduler service account, exactly like webx-studio's
// own strapiAdapter (lib/cms/strapi.ts) does for every entry write.
//
// Usage: node strapi-cms/seed-orst-nav.mjs
// Reads STRAPI_URL / STRAPI_SCHEDULER_EMAIL / STRAPI_SCHEDULER_PASSWORD from
// webx-studio/.env.local (same credentials strapi.ts's adapter uses), or
// from the environment if set.

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

// Verbatim from public-site/templates/orst/Header.tsx's navItems + megaMenuData,
// before that file was switched to read from CMS.
const NAV_ITEMS = [
  { key: "home", label: "หน้าหลัก", url: "/orst" },
  { key: "dictionary", label: "พจนานุกรมและคำศัพท์", url: "/orst/dictionary" },
  { key: "knowledge", label: "องค์ความรู้", url: "/orst/knowledge" },
  { key: "publications", label: "สื่อและสิ่งพิมพ์", url: "/orst/publications" },
  { key: "news", label: "ข่าวสารและกิจกรรม", url: "/orst/news" },
  { key: "services", label: "บริการประชาชน", url: "/orst/services" },
  { key: "about", label: "เกี่ยวกับเรา", url: "/orst/about" },
  { key: "contact", label: "ติดต่อเรา", url: "/orst/contact" },
];

const MEGA = {
  dictionary: {
    icon: "i-dictionary", eyebrow: "Language Services", title: "พจนานุกรมและคำศัพท์",
    description: "ค้นคำศัพท์ ความหมาย ศัพท์บัญญัติ และหลักเกณฑ์การใช้ภาษาไทยจากแหล่งข้อมูลเดียว",
    featuredLabel: "เปิดพจนานุกรมออนไลน์", featuredUrl: "/orst/dictionary",
    groups: [
      { heading: "บริการคำศัพท์", links: [
        { text: "พจนานุกรมออนไลน์", url: "/orst/dictionary", desc: "ค้นความหมายและการใช้คำ" },
        { text: "ศัพท์บัญญัติ", url: "#", desc: "ศัพท์เฉพาะทางและคำมาตรฐาน" },
        { text: "ค้นคำศัพท์ภาษาไทย", url: "#", desc: "ค้นหาคำตามหมวดและคำใกล้เคียง" },
      ] },
      { heading: "ฐานข้อมูลที่เกี่ยวข้อง", links: [
        { text: "สารานุกรมและอนุกรมวิธาน", url: "#", desc: "คลังความรู้และหมวดคำ" },
        { text: "หลักเกณฑ์การใช้ภาษา", url: "#", desc: "แนวทางการเขียนและการใช้ภาษา" },
        { text: "คำถามที่พบบ่อยด้านภาษา", url: "#", desc: "คำตอบสั้นสำหรับประชาชน" },
      ] },
    ],
  },
  knowledge: {
    icon: "i-book", eyebrow: "Knowledge Archive", title: "องค์ความรู้",
    description: "เข้าสู่คลังปัญญาแห่งชาติ บทความ ฐานข้อมูล และองค์ความรู้สำหรับประชาชน",
    featuredLabel: "เข้าสู่คลังองค์ความรู้", featuredUrl: "/orst/knowledge",
    groups: [
      { heading: "ค้นหาและฐานข้อมูล", links: [
        { text: "คลังองค์ความรู้", url: "/orst/knowledge", desc: "ค้นจากทุกฐานข้อมูล" },
        { text: "บทความวิชาการ", url: "#", desc: "บทความเผยแพร่และเอกสารอ้างอิง" },
        { text: "องค์ความรู้สำหรับประชาชน", url: "#", desc: "เนื้อหาเข้าใจง่ายสำหรับทุกกลุ่ม" },
      ] },
      { heading: "หมวดความรู้", links: [
        { text: "ภาษาไทย", url: "#", desc: "คำศัพท์ การใช้ภาษา และหลักเกณฑ์" },
        { text: "วิทยาศาสตร์", url: "#", desc: "ศัพท์วิชาการและองค์ความรู้ร่วมสมัย" },
        { text: "ศิลปกรรม", url: "#", desc: "ศิลปะ วัฒนธรรม และวรรณคดี" },
        { text: "สังคมศาสตร์", url: "#", desc: "ชุมชน เศรษฐกิจ สังคม และนโยบาย" },
      ] },
    ],
  },
  publications: {
    icon: "i-ebook", eyebrow: "Publications & Media", title: "สื่อและสิ่งพิมพ์",
    description: "รวมหนังสือ วารสาร e-Book สื่อดิจิทัล และเอกสารเผยแพร่ของสำนักงาน",
    featuredLabel: "ดูสื่อและสิ่งพิมพ์", featuredUrl: "/orst/publications",
    groups: [
      { heading: "สิ่งพิมพ์", links: [
        { text: "หนังสือและตำรา", url: "/orst/publications", desc: "หนังสือวิชาการและเอกสารอ้างอิง" },
        { text: "วารสารราชบัณฑิตยสภา", url: "#", desc: "วารสารและบทความเผยแพร่" },
        { text: "e-Book", url: "#", desc: "อ่านออนไลน์หรือดาวน์โหลด" },
      ] },
      { heading: "สื่อดิจิทัล", links: [
        { text: "วิดีโอและสื่อมัลติมีเดีย", url: "#", desc: "องค์ความรู้แบบรับชม" },
        { text: "Infographic", url: "#", desc: "สรุปความรู้เข้าใจง่าย" },
        { text: "วิธีสั่งซื้อหนังสือ", url: "#", desc: "ขั้นตอนและช่องทางชำระเงิน" },
      ] },
    ],
  },
  news: {
    icon: "i-megaphone", eyebrow: "News & Events", title: "ข่าวสารและกิจกรรม",
    description: "ติดตามข่าวประชาสัมพันธ์ ประกาศ กิจกรรม และความเคลื่อนไหวล่าสุด",
    featuredLabel: "อ่านข่าวทั้งหมด", featuredUrl: "/orst/news",
    groups: [
      { heading: "ข่าวสาร", links: [
        { text: "ข่าวประชาสัมพันธ์", url: "/orst/news", desc: "ข่าวสารทั่วไป" },
        { text: "ข่าวกิจกรรม", url: "#", desc: "กิจกรรมและงานเผยแพร่" },
        { text: "บทบรรยายทางวิชาการ", url: "#", desc: "สื่อความรู้จากกิจกรรม" },
      ] },
      { heading: "ประกาศ", links: [
        { text: "ประกาศจัดซื้อจัดจ้าง", url: "#", desc: "ประกาศและเอกสารที่เกี่ยวข้อง" },
        { text: "ประกาศรับสมัครงาน", url: "#", desc: "ข่าวสารงานบุคคล" },
        { text: "ข่าวสารทางราชการ", url: "#", desc: "ประกาศเผยแพร่ทั่วไป" },
      ] },
    ],
  },
  services: {
    icon: "i-service", eyebrow: "Digital Services", title: "บริการประชาชน",
    description: "รวมบริการออนไลน์ แบบฟอร์ม การติดตามสถานะ และช่องทางติดต่อเจ้าหน้าที่",
    featuredLabel: "เข้าสู่บริการประชาชน", featuredUrl: "/orst/services",
    groups: [
      { heading: "บริการออนไลน์", links: [
        { text: "สอบถามข้อมูลทางวิชาการ", url: "/orst/services", desc: "ส่งคำถามและรับเลขติดตาม" },
        { text: "ขออนุญาตใช้เนื้อหา", url: "#", desc: "ยื่นคำขอและแนบเอกสาร" },
        { text: "ร้องเรียน / เสนอแนะ", url: "#", desc: "ส่งเรื่องและติดตามผล" },
      ] },
      { heading: "งานบริการ", links: [
        { text: "แบบฟอร์มออนไลน์", url: "#", desc: "รวมแบบฟอร์มที่ใช้บ่อย" },
        { text: "คำถามที่พบบ่อย", url: "#", desc: "คำตอบเกี่ยวกับบริการ" },
        { text: "คู่มือการใช้บริการ", url: "#", desc: "ขั้นตอนและเอกสารประกอบ" },
      ] },
    ],
  },
  about: {
    icon: "i-shield", eyebrow: "About ORST", title: "เกี่ยวกับเรา",
    description: "ข้อมูลสำนักงาน โครงสร้าง ผู้บริหาร ราชบัณฑิต ภาคีสมาชิก และข้อมูลหน่วยงาน",
    featuredLabel: "ข้อมูลสำนักงาน", featuredUrl: "/orst/about",
    groups: [
      { heading: "ข้อมูลสำนักงาน", links: [
        { text: "ประวัติความเป็นมา", url: "#", desc: "ข้อมูลและพัฒนาการของสำนักงาน" },
        { text: "โครงสร้างองค์กร", url: "#", desc: "หน่วยงานและภารกิจ" },
        { text: "ผู้บริหาร", url: "#", desc: "คณะผู้บริหารปัจจุบัน" },
      ] },
      { heading: "ราชบัณฑิตและบุคลากร", links: [
        { text: "ราชบัณฑิตและภาคีสมาชิก", url: "#", desc: "รายชื่อและผลงาน" },
        { text: "บุคลากร", url: "#", desc: "ข้อมูลหน่วยงานและบุคลากร" },
        { text: "รายงานและแผนปฏิบัติราชการ", url: "#", desc: "ข้อมูลความโปร่งใสและผลการดำเนินงาน" },
      ] },
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

  const tenants = await req(ctUrl(TENANT_UID) + "?filters[key][$eq]=orst", token);
  const tenantRow = (tenants.results ?? tenants.data ?? [])[0];
  if (!tenantRow) throw new Error('No tenant found for key "orst"');
  const tenantId = tenantRow.id;
  console.log("orst tenant id:", tenantId);

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
