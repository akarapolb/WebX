// Importing a file of content (CSV, TSV or JSON) into a content type: reading the table, guessing which
// column goes to which field, and turning each row's text into the value its field needs. Pure functions,
// no I/O: the Content page uses them to preview a file, and the import route uses the SAME ones to
// check every row again on the server, so a browser can never send a value the server would not accept.

export type ImportFieldType = "string" | "url" | "text" | "html" | "richtext" | "email" | "integer" | "float" | "boolean" | "date" | "datetime" | "enumeration";
export type ImportField = { key: string; type: ImportFieldType; required?: boolean; options?: string[]; maxLength?: number };
export type Table = { headers: string[]; rows: string[][] };
export type RowError = { field: string; code: "required" | "number" | "date" | "boolean" | "option" | "email" | "url" | "too_long"; detail?: string };

export const MAX_IMPORT_ROWS = 500;
export const IMPORT_CHUNK = 50;

export class ImportParseError extends Error {
  constructor(public code: "empty" | "badjson" | "nohead") { super(code); }
}

/** Splits CSV/TSV text into rows of cells: quoted cells (with "" for a quote and line breaks inside),
 * a leading BOM, and the delimiter (comma, semicolon or tab) read from the first line. */
export function parseDelimited(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQ = false;
  for (const ch of text.split(/\r\n|\n|\r/, 1)[0] ?? "") {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delim = best[1] > 0 ? best[0] : ",";

  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); if (row.some((c) => c.trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) endField();
    else if (ch === "\n") endRow();
    else if (ch === "\r") { if (text[i + 1] === "\n") i++; endRow(); }
    else field += ch;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

const cellText = (v: unknown): string =>
  v == null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);

/** A file's text as a table: the first line is the header. A JSON file may be a list of objects, or an
 * object holding one (`{"items": [...]}`); its keys become the columns. */
export function parseTable(text: string, filename: string): Table {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) throw new ImportParseError("empty");
  if (/\.json$/i.test(filename) || /^[[{]/.test(trimmed)) {
    let v: unknown;
    try { v = JSON.parse(trimmed); } catch { throw new ImportParseError("badjson"); }
    const list = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v as object).find(Array.isArray) : undefined;
    if (!Array.isArray(list) || !list.every((r) => r && typeof r === "object" && !Array.isArray(r))) throw new ImportParseError("badjson");
    const headers: string[] = [];
    for (const r of list as Record<string, unknown>[]) for (const k of Object.keys(r)) if (!headers.includes(k)) headers.push(k);
    if (!headers.length) throw new ImportParseError("nohead");
    return { headers, rows: (list as Record<string, unknown>[]).map((r) => headers.map((h) => cellText(r[h]))) };
  }
  const all = parseDelimited(trimmed);
  if (!all.length) throw new ImportParseError("empty");
  const headers = all[0].map((h, i) => h.trim() || `(${i + 1})`);
  if (!headers.length) throw new ImportParseError("nohead");
  const rows = all.slice(1).map((r) => headers.map((_, i) => (r[i] ?? "").trim()));
  return { headers, rows };
}

// ---- guessing the mapping ----------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-./()]+/g, "");
// Column names people actually use (Thai and English) for the fields they fill most.
const SYNONYMS: Record<string, string[]> = {
  title: ["ชื่อ", "ชื่อเรื่อง", "หัวข้อ", "ชื่อรายการ", "ชื่อกิจกรรม", "ชื่อวารสาร", "name", "subject", "headline", "คำถาม", "question"],
  name: ["ชื่อ", "ชื่อ-สกุล", "ชื่อสกุล", "title"],
  excerpt: ["คำอธิบาย", "คำนำ", "สรุป", "รายละเอียดย่อ", "description", "summary", "คำตอบ", "answer"],
  content: ["เนื้อหา", "รายละเอียด", "body", "text", "detail", "details", "คำตอบ", "answer"],
  event_date: ["วันที่", "วันที่จัด", "วันที่จัดกิจกรรม", "date", "eventdate"],
  event_time: ["เวลา", "time", "eventtime"],
  location: ["สถานที่", "place", "venue"],
  category: ["หมวด", "หมวดหมู่", "ประเภท", "type"],
  year: ["ปี", "พ.ศ.", "ปีที่"],
  fiscal_year: ["ปีงบประมาณ", "fiscalyear"],
  icon: ["ไอคอน"],
  order: ["ลำดับ", "no", "seq", "sort"],
  tier: ["ระดับ", "ประเภทสมาชิก", "ประเภทราชบัณฑิต"],
  division: ["สำนัก", "กลุ่ม", "สังกัด", "department"],
  file_url: ["ลิงก์ไฟล์", "ไฟล์", "url", "link", "ลิงก์"],
  link_url: ["ลิงก์", "ลิงก์ปลายทาง", "ลิงก์ข่าว", "ที่อยู่เว็บ", "เว็บไซต์", "url", "link", "href", "website"],
  title_en: ["ชื่อภาษาอังกฤษ", "ชื่ออังกฤษ", "englishtitle", "titleenglish"],
  excerpt_en: ["คำอธิบายภาษาอังกฤษ", "คำอธิบายอังกฤษ", "englishdescription", "englishexcerpt"],
  email: ["อีเมล", "อีเมล์", "e-mail", "mail"],
  phone: ["โทร", "โทรศัพท์", "เบอร์โทร", "tel", "telephone"],
};

/** For each header, the key of the field it most likely belongs to ("" when there is no good guess).
 * A field takes only one column: an exact name wins, then the synonym lists above. */
export function guessMapping(headers: string[], fields: ImportField[]): string[] {
  const out = headers.map(() => "");
  const used = new Set<string>();
  const pass = (matches: (hdr: string, f: ImportField) => boolean) => {
    headers.forEach((h, i) => {
      if (out[i]) return;
      const hn = norm(h);
      const f = fields.find((x) => !used.has(x.key) && matches(hn, x));
      if (f) { out[i] = f.key; used.add(f.key); }
    });
  };
  pass((hn, f) => hn === norm(f.key));
  pass((hn, f) => (SYNONYMS[f.key] ?? []).some((s) => norm(s) === hn));
  return out;
}

/** One row as { field key: text } for the columns that have a target. The first non-empty column wins
 * when two columns go to the same field. */
export function recordFromRow(row: string[], mapping: string[]): Record<string, string> {
  const rec: Record<string, string> = {};
  mapping.forEach((key, i) => {
    if (!key) return;
    const v = (row[i] ?? "").trim();
    if (v !== "" && (rec[key] === undefined || rec[key] === "")) rec[key] = v;
  });
  return rec;
}

// ---- turning text into the field's value ------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
/** YYYY-MM-DD from 2026-09-05, 2026/9/5, 5/9/2026 or 5-9-2569 (a Buddhist year, over 2400, is converted). */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/[T ].*$/, "");
  let y: number, m: number, d: number;
  let r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else return null;
  if (y > 2400) y -= 543;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || m > 12 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// The same rule as public-site/lib/linkUrl.ts (safeLink), which checks it again before it is shown: an http(s)
// address, mailto:, tel:, or a path or anchor on this site. Never javascript: or data:.
const UNSAFE_LINK_CHARS = /[\s\u0000-\u001f\u007f<>"'`\\]/;
export function isSafeLink(s: string): boolean {
  if (!s || s.length > 2000 || UNSAFE_LINK_CHARS.test(s)) return false;
  return /^https?:\/\/[^/?#]+/i.test(s) || /^(mailto|tel):./i.test(s) || s.startsWith("#") || (s.startsWith("/") && !s.startsWith("//"));
}

const TRUE_RE = /^(true|yes|y|1|ใช่|จริง|เปิด)$/i, FALSE_RE = /^(false|no|n|0|ไม่|ไม่ใช่|เท็จ|ปิด)$/i;

export function coerceValue(raw: string, f: ImportField): { ok: true; value: unknown } | { ok: false; error: RowError } {
  const s = raw.trim();
  const bad = (code: RowError["code"], detail?: string) => ({ ok: false as const, error: { field: f.key, code, ...(detail ? { detail } : {}) } });
  switch (f.type) {
    case "integer": { const n = s.replace(/,/g, ""); return /^-?\d+$/.test(n) ? { ok: true, value: Number(n) } : bad("number"); }
    case "float": { const n = s.replace(/,/g, ""); return /^-?\d+(\.\d+)?$/.test(n) ? { ok: true, value: Number(n) } : bad("number"); }
    case "boolean": return TRUE_RE.test(s) ? { ok: true, value: true } : FALSE_RE.test(s) ? { ok: true, value: false } : bad("boolean");
    case "date": { const d = normalizeDate(s); return d ? { ok: true, value: d } : bad("date"); }
    case "datetime": { const d = normalizeDate(s); return d ? { ok: true, value: s.length > 10 && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : `${d}T00:00:00.000Z` } : bad("date"); }
    case "url": return isSafeLink(s) ? { ok: true, value: s } : bad("url");
    case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { ok: true, value: s } : bad("email");
    case "enumeration": {
      const hit = (f.options ?? []).find((o) => o.toLowerCase() === s.toLowerCase());
      return hit !== undefined ? { ok: true, value: hit } : bad("option", (f.options ?? []).join(", "));
    }
    default:
      if (f.maxLength && s.length > f.maxLength) return bad("too_long", String(f.maxLength));
      return { ok: true, value: s };
  }
}

/** The values to create an entry with, from a { field key: text } record; every problem is listed. Only
 * the given fields are ever read, so a key that is not a writable field of the type is simply ignored. */
export function coerceRecord(rec: Record<string, string>, fields: ImportField[]): { data: Record<string, unknown>; errors: RowError[] } {
  const data: Record<string, unknown> = {};
  const errors: RowError[] = [];
  for (const f of fields) {
    const raw = typeof rec[f.key] === "string" ? rec[f.key].trim() : "";
    if (raw === "") { if (f.required) errors.push({ field: f.key, code: "required" }); continue; }
    const r = coerceValue(raw, f);
    if (r.ok) data[f.key] = r.value; else errors.push(r.error);
  }
  return { data, errors };
}

/** Which field to compare to find an entry with the same title already there. */
export function titleKeyOf(fields: ImportField[]): string | null {
  for (const k of ["title", "name", "subject", "question", "label"]) if (fields.some((f) => f.key === k)) return k;
  return null;
}
