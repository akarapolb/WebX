// What the "bind to live WordPress data" panel offers. A block bound to a feed gets its items from entries
// added under Content (news posts, services, events, …); the binding says WHICH kind of entry and HOW each
// one is shown (as a card, a link row, a dated row, an FAQ…). The mappers behind these values live in
// public-site/lib/blockSource.ts; the specialised ones only make sense for one kind of entry, so they are
// offered for that kind only. The generic "card" and "link" work for every kind.

export type SourceMapKey = "card" | "link" | "dated" | "faq" | "mission" | "orgunit" | "document" | "timeline" | "calendar" | "directory";

export type SourceCategory = { value: string; th: string; en: string; maps: SourceMapKey[] };

const GENERIC: SourceMapKey[] = ["card", "link"];
export const SOURCE_CATEGORIES: SourceCategory[] = [
  { value: "news", th: "ข่าวสารและโพสต์", en: "News and posts", maps: ["card", "link", "dated"] },
  { value: "service", th: "บริการ", en: "Services", maps: GENERIC },
  { value: "publication", th: "สิ่งพิมพ์และวารสาร", en: "Publications and journals", maps: ["card", "link", "dated"] },
  { value: "resource", th: "คลังความรู้", en: "Knowledge resources", maps: ["card", "link", "dated"] },
  { value: "event", th: "กิจกรรม", en: "Events", maps: ["calendar", "card", "link"] },
  { value: "member", th: "สมาชิกและราชบัณฑิต", en: "Members", maps: ["directory", "card"] },
  { value: "faq", th: "คำถามที่พบบ่อย", en: "FAQs", maps: ["faq"] },
  { value: "mission", th: "พันธกิจ", en: "Mission items", maps: ["mission"] },
  { value: "org-unit", th: "หน่วยงานและสำนัก", en: "Organisation units", maps: ["orgunit", "card", "link"] },
  { value: "document", th: "เอกสาร (เช่น เอกสาร ITA)", en: "Documents", maps: ["document", "link"] },
  { value: "timeline", th: "ลำดับเหตุการณ์", en: "Timeline", maps: ["timeline"] },
];

export const SOURCE_MAPS: Record<SourceMapKey, { th: string; en: string; descTh: string; descEn: string; icon: boolean; tag: boolean }> = {
  card: { th: "การ์ด", en: "Cards", descTh: "การ์ดมีไอคอน ชื่อ คำอธิบาย และวันที่ ใช้กับบล็อกแบบการ์ด", descEn: "A card with an icon, title, text and date, for card-style blocks.", icon: true, tag: true },
  link: { th: "แถวลิงก์", en: "Link rows", descTh: "แถวบรรทัดเดียว ชื่อ + คำอธิบายสั้น ใช้กับบล็อกรายการลิงก์", descEn: "One row each, title plus a short line, for link-list blocks.", icon: true, tag: false },
  dated: { th: "รายการลงวันที่", en: "Dated list", descTh: "ชื่อพร้อมวันที่ ใช้กับรายการข่าว/บทความ", descEn: "Title with its date, for news and article lists.", icon: false, tag: false },
  faq: { th: "คำถาม-คำตอบ", en: "Questions and answers", descTh: "ชื่อเป็นคำถาม คำอธิบายเป็นคำตอบ ใช้กับบล็อก FAQ", descEn: "The title is the question and the text the answer, for FAQ blocks.", icon: false, tag: false },
  mission: { th: "พันธกิจ", en: "Mission grid", descTh: "รายการพันธกิจพร้อมไอคอนของแต่ละรายการ", descEn: "Mission items, each with its own icon.", icon: false, tag: false },
  orgunit: { th: "โครงสร้างหน่วยงาน", en: "Organisation structure", descTh: "รายชื่อหน่วยงานพร้อมคำอธิบาย", descEn: "The units with a short description.", icon: false, tag: false },
  document: { th: "เอกสารดาวน์โหลด", en: "Documents", descTh: "เอกสารพร้อมป้าย ปีงบประมาณ และลิงก์ไฟล์", descEn: "Documents with a tag, fiscal year and file link.", icon: false, tag: false },
  timeline: { th: "เส้นเวลา", en: "Timeline", descTh: "เหตุการณ์เรียงตามปี", descEn: "Events in order by year.", icon: false, tag: false },
  calendar: { th: "ปฏิทินกิจกรรม", en: "Event calendar", descTh: "กิจกรรมบนปฏิทินตามวันที่จัด ใช้กับบล็อกปฏิทิน", descEn: "Events on a calendar by their date, for the calendar block.", icon: false, tag: false },
  directory: { th: "รายชื่อสมาชิก", en: "Member directory", descTh: "รูป ชื่อ ระดับ และสำนักของสมาชิก ใช้กับบล็อกรายชื่อสมาชิก", descEn: "Photo, name, tier and division, for the member directory block.", icon: false, tag: false },
};

export const categoryOf = (value: string | undefined): SourceCategory | undefined => SOURCE_CATEGORIES.find((c) => c.value === value);

/** The first way to show this kind of entry: its specialised view when it has one, else cards. */
export const defaultMapFor = (category: string): SourceMapKey => categoryOf(category)?.maps[0] ?? "card";

/** Whether this way of showing it works for this kind of entry. */
export const isValidCombo = (category: string, map: string): boolean => Boolean(categoryOf(category)?.maps.includes(map as SourceMapKey));
