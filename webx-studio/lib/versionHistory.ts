// What the Visual Builder's History shows for each saved version: a readable name, a clear date and time, and what
// exactly differs from the page on the canvas now (which field, what it said then, what it says now).

/** The name to show. Automatic labels ("Published", "agent:<run id>") read as words; a name someone typed is kept. */
export function versionName(label: string | undefined, t: (k: string) => string): { text: string; auto: boolean } {
  const l = (label || "").trim();
  if (!l) return { text: t("vb.ver.untitled"), auto: true };
  if (l === "Published") return { text: t("vb.ver.published"), auto: true };
  if (l === "Manual save" || l === "บันทึกเอง") return { text: t("vb.manualver"), auto: true };
  const agent = /^agent:[0-9a-f-]+(\s*\(EN\))?$/i.exec(l);
  if (agent) return { text: t("vb.ver.agent") + (agent[1] ? " (EN)" : ""), auto: true };
  return { text: l, auto: false };
}

const DAY = 86_400_000;
function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

/** "Today" / "Yesterday" / "Monday 3 November 2026": the heading a version is grouped under. */
export function dayHeading(iso: string, lang: string, now = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Math.round((dayStart(now) - dayStart(d)) / DAY);
  if (diff === 0) return lang === "th" ? "วันนี้" : "Today";
  if (diff === 1) return lang === "th" ? "เมื่อวาน" : "Yesterday";
  return d.toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** The clock time with seconds ("10:36:12"), so two saves in the same minute can be told apart. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function ago(iso: string, lang: string, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (!isFinite(s)) return "";
  const th = lang === "th";
  if (s < 45) return th ? "เมื่อสักครู่" : "just now";
  const m = Math.round(s / 60);
  if (m < 60) return th ? m + " นาทีที่แล้ว" : m + (m === 1 ? " minute ago" : " minutes ago");
  const h = Math.round(m / 60);
  if (h < 24) return th ? h + " ชั่วโมงที่แล้ว" : h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.round(h / 24);
  return th ? d + " วันที่แล้ว" : d + (d === 1 ? " day ago" : " days ago");
}

/** The date in full, for a tooltip: "Monday 10 November 2026, 10:36:12". */
export function fullDate(iso: string, lang: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || "";
  return d.toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + ", " + clockTime(iso);
}

// ---------------------------------------------------------------- the comparison

export type FieldChange = { field: string; before: string; after: string };
export type BlockChange = {
  /** Position on the page, from 1. */
  n: number;
  comp: string;
  status: "added" | "removed" | "changed" | "replaced";
  /** What the block was before it was replaced. */
  fromComp?: string;
  changes: FieldChange[];
};

const IGNORED = new Set(["__component", "id", "__agent", "__vb"]);
const MAX = 140;

/** A value as a short line of text: strings as they are, lists by their size, anything else in brief. */
export function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "string") return v.length > MAX ? v.slice(0, MAX - 1) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.length + (v.length === 1 ? " item" : " items");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.url === "string") return o.url;
    const text = ["label", "title", "name", "heading", "href"].map((k) => o[k]).find((x) => typeof x === "string" && x);
    if (text) return show(text);
    const s = JSON.stringify(v);
    return s.length > MAX ? s.slice(0, MAX - 1) + "…" : s;
  }
  return String(v);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The differences inside one field, down to each item of a list ("items #2 · title"). */
function fieldChanges(field: string, a: unknown, b: unknown, out: FieldChange[]) {
  if (same(a, b)) return;
  if (field === "styles" && (a == null || typeof a === "object") && (b == null || typeof b === "object")) {
    a = a || {}; b = b || {};
    const keys = [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])].sort();
    for (const k of keys) {
      const x = (a as any)[k], y = (b as any)[k];
      if (!same(x, y)) out.push({ field: "style · " + k, before: styleText(x), after: styleText(y) });
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const x = a[i], y = b[i];
      if (same(x, y)) continue;
      const label = field + " #" + (i + 1);
      if (x === undefined) { out.push({ field: label, before: "", after: show(y) || "(new)" }); continue; }
      if (y === undefined) { out.push({ field: label, before: show(x) || "(removed)", after: "" }); continue; }
      if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x) && !Array.isArray(y)) {
        for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])]) {
          if (IGNORED.has(k)) continue;
          if (!same(x[k], y[k])) out.push({ field: label + " · " + k, before: show(x[k]), after: show(y[k]) });
        }
      } else out.push({ field: label, before: show(x), after: show(y) });
    }
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])]) {
      if (!same((a as any)[k], (b as any)[k])) out.push({ field: field + " · " + k, before: show((a as any)[k]), after: show((b as any)[k]) });
    }
    return;
  }
  out.push({ field, before: show(a), after: show(b) });
}

function styleText(v: unknown): string {
  if (!v || typeof v !== "object") return show(v);
  return Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null && x !== "").map(([k, x]) => k + ": " + (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
}

/** Every block that differs between a saved version (then) and the canvas (now), with what changed in it. */
export function compareVersions(then: any[] | undefined, now: any[] | undefined): BlockChange[] {
  const a = Array.isArray(then) ? then : [], b = Array.isArray(now) ? now : [];
  const out: BlockChange[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x && !y) { out.push({ n: i + 1, comp: x.__component, status: "removed", changes: [] }); continue; }
    if (!x && y) { out.push({ n: i + 1, comp: y.__component, status: "added", changes: [] }); continue; }
    if (x.__component !== y.__component) { out.push({ n: i + 1, comp: y.__component, fromComp: x.__component, status: "replaced", changes: [] }); continue; }
    const changes: FieldChange[] = [];
    for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])]) {
      if (IGNORED.has(k)) continue;
      fieldChanges(k, x[k], y[k], changes);
    }
    if (changes.length) out.push({ n: i + 1, comp: y.__component, status: "changed", changes });
  }
  return out;
}
