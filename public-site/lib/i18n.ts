// Bilingual gov-portal (TH/EN). The ORST/RoyalSociety templates carry their own
// strings; this is the shared dictionary + URL helpers for the gov-portal tree
// (app/(gov-portal)/...), where Thai pages live at "/" (dga) or "/<tenant>" and
// English pages at "/en" or "/en/<tenant>".
//
// Server components get `locale` as a prop from their route. Client components
// mounted app-wide (CookieConsent, ThemeToggle, ShareButtons) read it from the
// URL with pathLocale(), the same "/en" rule the root layout's THEME_BOOT uses.
import type { Locale } from "./cms";

export type { Locale };

/** "/" + tenant, with "/en" in front for English. dga is the root tenant. */
export function homeHref(tenant: string, locale: Locale): string {
  const b = (locale === "en" ? "/en" : "") + (tenant && tenant !== "dga" ? "/" + tenant : "");
  return b || "/";
}

/** A tenant sub-page: homeHref + "/" + slug. */
export function pageHref(tenant: string, locale: Locale, slug: string): string {
  const h = homeHref(tenant, locale);
  return (h === "/" ? "" : h) + "/" + slug;
}

/**
 * Editors store one URL per nav item. On an English page an internal link
 * ("/dgahub/overview", "/", "#faq") points at its English twin; external links,
 * mailto/tel and links already under /en are left alone.
 */
export function localizeHref(url: string, locale: Locale): string {
  if (locale !== "en" || !url) return url;
  if (!url.startsWith("/") || url.startsWith("//") || url === "/en" || url.startsWith("/en/")) return url;
  return url === "/" ? "/en" : "/en" + url;
}

/** The same page in the other language (Thai path ⇄ English path). */
export function otherLocaleHref(path: string, locale: Locale): string {
  if (locale === "en") return path.replace(/^\/en(?=\/|$)/, "") || "/";
  return path === "/" ? "/en" : "/en" + path;
}

/** Client-side locale from the URL. */
export function pathLocale(pathname?: string): Locale {
  const p = pathname ?? (typeof location !== "undefined" ? location.pathname : "/");
  return p === "/en" || p.startsWith("/en/") ? "en" : "th";
}

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** Thai: "17 ก.ย. 67" (Buddhist era, as fmtDateTh). English: "17 Sep 2024". */
export function fmtDate(iso: string | undefined, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  if (locale === "en") return d.getDate() + " " + EN_MONTHS[d.getMonth()] + " " + d.getFullYear();
  return d.getDate() + " " + TH_MONTHS[d.getMonth()] + " " + ((d.getFullYear() + 543) % 100);
}

export function fmtNumber(n: number | undefined, locale: Locale, digits?: number): string {
  if (n == null || !isFinite(Number(n))) return "–";
  return Number(n).toLocaleString(locale === "en" ? "en-GB" : "th-TH", digits != null ? { minimumFractionDigits: digits, maximumFractionDigits: digits } : undefined);
}

const S = {
  home: { th: "หน้าแรก", en: "Home" },
  mainMenu: { th: "เมนูหลัก", en: "Main menu" },
  switchTo: { th: "Switch to English", en: "เปลี่ยนเป็นภาษาไทย" },
  phone: { th: "โทร", en: "Tel." },
  adminLogin: { th: "เข้าระบบผู้ดูแล", en: "Staff sign-in" },
  skip: { th: "ข้ามไปยังเนื้อหาหลัก", en: "Skip to main content" },
  faqEyebrow: { th: "ถาม–ตอบ", en: "Q&A" },
  faqTitle: { th: "คำถามที่พบบ่อย", en: "Frequently asked questions" },
  newsHeading: { th: "ข่าวและบทความ", en: "News and articles" },
  newsTabs: { th: "หมวดข่าว", en: "News categories" },
  newsTab: { th: "ข่าว", en: "News" },
  articleTab: { th: "บทความ", en: "Articles" },
  readMore: { th: "อ่านต่อ", en: "Read more" },
  highlights: { th: "ไฮไลต์ประชาสัมพันธ์", en: "Highlights" },
  stats: { th: "ตัวเลขสำคัญ", en: "Key figures" },
  views: { th: "ครั้ง", en: "views" },
  recommended: { th: "แนะนำ", en: "Recommended" },
  // charts / datasets
  dataTable: { th: "ตารางข้อมูล", en: "Data table" },
  showTable: { th: "แสดงตารางข้อมูล", en: "Show data table" },
  source: { th: "แหล่งข้อมูล", en: "Source" },
  unverified: { th: "ข้อมูลต้นแบบ ยังไม่ได้ตรวจสอบกับแหล่งต้นทาง", en: "Prototype data, not yet checked against the original source" },
  rankNote: { th: "อันดับ: ค่าน้อยคือดีกว่า", en: "Rank: lower is better" },
  noData: { th: "ยังไม่มีข้อมูลสำหรับกราฟนี้", en: "No data for this chart yet" },
  download: { th: "ดาวน์โหลด", en: "Download" },
  dictionary: { th: "พจนานุกรมข้อมูล", en: "Data dictionary" },
  field: { th: "ฟิลด์", en: "Field" },
  meaning: { th: "ความหมาย", en: "Meaning" },
  type: { th: "ชนิด", en: "Type" },
  records: { th: "รายการ", en: "records" },
  license: { th: "สัญญาอนุญาต", en: "License" },
  updated: { th: "ปรับปรุง", en: "Updated" },
  api: { th: "API (JSON)", en: "API (JSON)" },
  // assistant
  ask: { th: "ถาม", en: "Ask" },
  asking: { th: "กำลังค้นหาคำตอบ…", en: "Finding an answer…" },
  askLabel: { th: "พิมพ์คำถามของคุณ", en: "Type your question" },
  sources: { th: "แหล่งอ้างอิง", en: "Sources" },
  noAnswer: { th: "ยังไม่พบคำตอบในเว็บไซต์นี้ ลองถามด้วยคำอื่น", en: "No answer found on this site. Try other words." },
  quoted: { th: "ข้อความจากแหล่งที่ตรงที่สุด (ยังไม่ได้เปิดใช้ AI สรุปคำตอบ)", en: "Closest passage on this site (AI summaries are not switched on)" },
  aiNote: { th: "คำตอบสร้างโดย AI จากเนื้อหาในเว็บไซต์นี้ โปรดตรวจสอบกับแหล่งอ้างอิง", en: "AI-generated from this site's content. Please check the sources." },
  askError: { th: "ขออภัย ระบบไม่พร้อมใช้งานชั่วคราว", en: "Sorry, the assistant is unavailable right now." },
  // forms
  copied: { th: "คัดลอกแล้ว", en: "Copied" },
  copy: { th: "คัดลอก", en: "Copy" },
  captcha: { th: "แบบยืนยันตัวตน", en: "Verification" },
  loading: { th: "กำลังโหลด…", en: "Loading…" },
  captchaWait: { th: "กำลังเตรียมแบบยืนยันตัวตน กรุณาลองใหม่อีกครั้งในอีกสักครู่", en: "The verification question is still loading. Please try again in a moment." },
  fileTooBig: { th: "ไฟล์ต้องมีขนาดไม่เกิน {n}MB", en: "The file must be {n} MB or smaller" },
  captchaWrong: { th: "คำตอบยืนยันตัวตนไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่", en: "The verification answer was wrong or expired. Please try again." },
  sendFail: { th: "ไม่สามารถส่งข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง", en: "Couldn't send right now. Please try again." },
  netFail: { th: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง", en: "Couldn't reach the server. Please try again." },
  sent: { th: "ส่งข้อมูลเรียบร้อยแล้ว", en: "Sent. Thank you." },
  username: { th: "ชื่อผู้ใช้งาน", en: "Username" },
  ref: { th: "เลขอ้างอิง", en: "Reference" },
  choose: { th: "— เลือก —", en: "— Choose —" },
  maxSize: { th: "ขนาดไม่เกิน {n}MB", en: "Up to {n} MB" },
  nidHint: { th: "กรอกเลขประจำตัวประชาชน 13 หลัก", en: "Enter the 13-digit national ID number" },
  anonymous: { th: "ไม่ประสงค์ออกนาม", en: "Stay anonymous" },
  sending: { th: "กำลังส่ง…", en: "Sending…" },
  submit: { th: "ส่งข้อมูล", en: "Send" },
  searching: { th: "กำลังค้นหา…", en: "Searching…" },
  track: { th: "ติดตามสถานะ", en: "Track status" },
  notFound: { th: "ไม่พบข้อมูลตามเลขอ้างอิงนี้", en: "Nothing found for this reference" },
  trackFail: { th: "ไม่สามารถตรวจสอบสถานะได้ในขณะนี้", en: "Couldn't check the status right now" },
  filedOn: { th: "วันที่ยื่นเรื่อง", en: "Filed on" },
} satisfies Record<string, { th: string; en: string }>;

export type StringKey = keyof typeof S;

/** UI string in the given locale; "{n}" is replaced by `n` when given. */
export function t(key: StringKey, locale: Locale, n?: string | number): string {
  const s = S[key][locale] ?? S[key].th;
  return n == null ? s : s.replace("{n}", String(n));
}
