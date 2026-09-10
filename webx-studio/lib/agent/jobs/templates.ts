// Job templates (Phase 9, M5): the common background jobs, with parameters a
// form collects and a preview can count before anything runs.
//
// "agent" templates run the model. bulk_create fixes its plan up front (one
// item per draft) and gives the model every field schema in its goal, so it
// writes instead of exploring. "direct" templates run one tool per item with
// no model at all (translate or audit each entry), which costs no tokens for
// the loop and can't wander.
//
// Pure: listing entries and reading schemas happen in governance.ts.
import type { AppliedRef } from "../engine/types";
import type { ContentTypeSchema, FieldInfo } from "../schemaDigest";
import type { AgentLevel, PlanItem, RunPlan } from "../types";

export type TemplateKey = "bulk_create" | "bulk_translate" | "audit_all" | "custom";

export type TemplateInfo = {
  key: TemplateKey;
  strategy: "agent" | "direct";
  /** Can be put on a schedule (M6). */
  schedulable: boolean;
  minLevel: AgentLevel;
  /** For direct templates: the tool run for each item. */
  tool?: "translate_fields" | "audit_entry";
};

export const TEMPLATES: Record<TemplateKey, TemplateInfo> = {
  bulk_create: { key: "bulk_create", strategy: "agent", schedulable: false, minLevel: "draft" },
  bulk_translate: { key: "bulk_translate", strategy: "direct", schedulable: true, minLevel: "draft", tool: "translate_fields" },
  audit_all: { key: "audit_all", strategy: "direct", schedulable: true, minLevel: "read", tool: "audit_entry" },
  custom: { key: "custom", strategy: "agent", schedulable: true, minLevel: "read" },
};

export const isTemplateKey = (v: unknown): v is TemplateKey => typeof v === "string" && Object.prototype.hasOwnProperty.call(TEMPLATES, v);

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

export type BulkCreateParams = { contentTypes: string[]; perType: number; brief: string; submit: boolean };
export type BulkTranslateParams = { contentType: string; targetLocale: string; sourceLocale?: string; q?: string; updatedSince?: string; ids?: string[]; max: number };
export type AuditAllParams = { contentTypes: string[]; updatedSince?: string; max: number };
export type CustomParams = { goal: string; tools?: string[] };
export type TemplateParams = { bulk_create: BulkCreateParams; bulk_translate: BulkTranslateParams; audit_all: AuditAllParams; custom: CustomParams };

export type DirectItem = { uid: string; id: string; title: string };
export type DirectResult = DirectItem & {
  ok: boolean;
  /** Not attempted, e.g. a translation already waiting in review. */
  skipped?: boolean;
  summary: string;
  findings?: { dimension: string; severity: string; message: string }[];
};

const UID_RE = /^(api::[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*|wp:[a-z][a-z0-9-]*)$/;
const LOCALE_RE = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;
const TOOL_RE = /^[a-z][a-z0-9_]{1,40}$/;

function text(v: unknown, name: string, max: number, required = false): string {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : null;
  if (s === null) throw new TemplateError(`${name} must be text`);
  if (required && !s) throw new TemplateError(`${name} is required`);
  if (s.length > max) throw new TemplateError(`${name} must be at most ${max} characters`);
  return s;
}

function int(v: unknown, name: string, min: number, max: number): number {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new TemplateError(`${name} must be a whole number from ${min} to ${max}`);
  return n;
}

function uid(v: unknown, name: string): string {
  if (typeof v !== "string" || !UID_RE.test(v)) throw new TemplateError(`${name} must be a content type uid such as api::article.article`);
  return v;
}

function uidList(v: unknown, name: string, max: number): string[] {
  if (!Array.isArray(v) || !v.length) throw new TemplateError(`Choose at least one content type`);
  const list = [...new Set(v.map((x) => uid(x, name)))];
  if (list.length > max) throw new TemplateError(`Choose at most ${max} content types`);
  return list;
}

function locale(v: unknown, name: string): string {
  if (typeof v !== "string" || !LOCALE_RE.test(v)) throw new TemplateError(`${name} must be a language code such as th or en`);
  return v;
}

function isoDate(v: unknown, name: string): string | undefined {
  if (v == null || v === "") return undefined;
  const t = Date.parse(String(v));
  if (!Number.isFinite(t)) throw new TemplateError(`${name} must be a date`);
  return new Date(t).toISOString();
}

export function parseTemplateParams<K extends TemplateKey>(key: K, raw: any): TemplateParams[K] {
  const r = raw && typeof raw === "object" ? raw : {};
  switch (key) {
    case "bulk_create":
      return {
        contentTypes: uidList(r.contentTypes, "contentTypes", 20),
        perType: int(r.perType ?? 1, "perType", 1, 5),
        brief: text(r.brief, "brief", 2000),
        submit: Boolean(r.submit),
      } as TemplateParams[K];
    case "bulk_translate": {
      const targetLocale = locale(r.targetLocale, "targetLocale");
      const sourceLocale = r.sourceLocale ? locale(r.sourceLocale, "sourceLocale") : undefined;
      if (sourceLocale === targetLocale) throw new TemplateError("The target language must differ from the source language");
      let ids: string[] | undefined;
      if (r.ids != null) {
        if (!Array.isArray(r.ids) || r.ids.some((x: unknown) => typeof x !== "string" || !x)) throw new TemplateError("ids must be a list of entry ids");
        ids = [...new Set(r.ids as string[])].slice(0, 200);
      }
      return {
        contentType: uid(r.contentType, "contentType"), targetLocale, sourceLocale,
        q: text(r.q, "q", 200) || undefined, updatedSince: isoDate(r.updatedSince, "updatedSince"), ids,
        max: int(r.max ?? 50, "max", 1, 200),
      } as TemplateParams[K];
    }
    case "audit_all":
      return {
        contentTypes: uidList(r.contentTypes, "contentTypes", 20),
        updatedSince: isoDate(r.updatedSince, "updatedSince"),
        max: int(r.max ?? 100, "max", 1, 500),
      } as TemplateParams[K];
    default: {
      let tools: string[] | undefined;
      if (r.tools != null) {
        if (!Array.isArray(r.tools) || r.tools.some((x: unknown) => typeof x !== "string" || !TOOL_RE.test(x))) throw new TemplateError("tools must be a list of tool names");
        tools = [...new Set(r.tools as string[])].slice(0, 30);
      }
      return { goal: text(r.goal, "goal", 8000, true), ...(tools ? { tools } : {}) } as TemplateParams[K];
    }
  }
}

/** The autonomy a job needs for its whole run; a custom job needs what its owner had when they started it. */
export function requiredLevelFor(key: TemplateKey, params: any, ownerLevel: AgentLevel): AgentLevel {
  if (key === "bulk_create") return params?.submit ? "draft_submit" : "draft";
  if (key === "custom") return ownerLevel;
  return TEMPLATES[key].minLevel;
}

export function templateTitle(key: TemplateKey, p: any, names: Record<string, string>, lang: "en" | "th"): string {
  const th = lang === "th";
  const name = (u: string) => names[u] || u;
  switch (key) {
    case "bulk_create": {
      const n = p.contentTypes.length * p.perType;
      return th
        ? `สร้างฉบับร่าง ${n} รายการ (${p.contentTypes.length} ประเภท)`
        : `Create ${n} draft${n === 1 ? "" : "s"} across ${p.contentTypes.length} content type${p.contentTypes.length === 1 ? "" : "s"}`;
    }
    case "bulk_translate":
      return th ? `แปล${name(p.contentType)}เป็น ${p.targetLocale}` : `Translate ${name(p.contentType)} into ${p.targetLocale}`;
    case "audit_all":
      return th ? `ตรวจสอบเนื้อหา: ${p.contentTypes.map(name).join(", ")}` : `Audit ${p.contentTypes.map(name).join(", ")}`;
    default:
      return String(p.goal).split("\n")[0].slice(0, 120);
  }
}

// ---- bulk_create ----

const slug = (u: string) => u.replace(/^api::/, "").replace(/^wp:/, "wp-").split(".")[0];

export function bulkCreatePlan(p: BulkCreateParams, names: Record<string, string>): PlanItem[] {
  const items: PlanItem[] = [];
  for (const u of p.contentTypes) {
    for (let i = 1; i <= p.perType; i++) {
      const label = names[u] || u;
      items.push({ id: `${slug(u)}-${i}`, title: p.perType > 1 ? `${label} draft ${i}` : `${label} draft`, detail: u, status: "pending" });
    }
  }
  return items;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function fieldLine(f: FieldInfo): string {
  const extras = [
    f.enum ? `one of ${f.enum.map((v) => JSON.stringify(v)).join("|")}` : "",
    f.maxLength ? `max ${f.maxLength} chars` : "",
    f.target ? `→ ${f.target}` : "",
  ].filter(Boolean);
  return `${f.name}${f.required ? "*" : ""} (${f.type}${extras.length ? ", " + extras.join(", ") : ""})`;
}

/** The job's goal: what to create, the editor's brief, and the writable fields of every type, so no exploring is needed. */
export function bulkCreateGoal(p: BulkCreateParams, schemas: ContentTypeSchema[]): string {
  const lines = [
    `Create ${p.perType} draft entr${p.perType === 1 ? "y" : "ies"} of each content type listed below${p.submit ? ", then submit each one for review" : ""}.`,
    p.brief ? `Brief from the editor: ${p.brief}` : "Write realistic, short content suited to a Thai government website.",
    "The plan is already set, with one item per draft; each item's detail is its content type. Creating an entry marks the next open item for its type done automatically. Use update_plan only to mark an item blocked or skipped, with the reason.",
    "Fields for each type (* = required; use exactly these names, and leave out fields not listed):",
  ];
  for (const s of schemas) {
    const fields = s.fields.filter((f) => f.writable).slice(0, 25).map(fieldLine).join("; ");
    lines.push(clip(`- ${s.uid} (${s.name}): ${fields || "no writable fields"}`, 700));
  }
  return clip(lines.join("\n"), 7800);
}

/** Marks the next open plan item for `uid` done with the new entry's id. Returns it, or null. */
export function tickPlanForCreate(plan: RunPlan | undefined, uid: string, id: string): PlanItem | null {
  const item = plan?.items.find((i) => i.detail === uid && (i.status === "pending" || i.status === "in_progress"));
  if (!item) return null;
  item.status = "done";
  item.result = id;
  return item;
}

/**
 * Items marked done with no draft behind them go back to pending, so the
 * model's reminders send it back to them (at most twice; then the job ends
 * incomplete). Returns what changed.
 */
export function verifyBulkCreate(plan: RunPlan, applied: AppliedRef[]): PlanItem[] {
  const created = new Set(applied.map((a) => `${a.uid} ${a.id}`));
  const changed: PlanItem[] = [];
  for (const item of plan.items) {
    if (item.status === "done" && !(item.detail && item.result && created.has(`${item.detail} ${item.result}`))) {
      item.status = "pending";
      item.note = "Marked done, but no draft was created for it.";
      delete item.result;
      changed.push(item);
    }
  }
  return changed;
}

// ---- direct templates ----

export function directReport(key: "bulk_translate" | "audit_all", results: DirectResult[], total: number, lang: "en" | "th"): { text: string; counts: Record<string, number> } {
  const th = lang === "th";
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  if (key === "audit_all") {
    const counts: Record<string, number> = { checked: results.filter((r) => r.ok).length, failed, withFindings: 0 };
    for (const r of results) {
      if (r.findings?.length) counts.withFindings++;
      for (const f of r.findings ?? []) counts[f.severity] = (counts[f.severity] || 0) + 1;
    }
    const sev = ["high", "medium", "low"].filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(", ");
    return {
      counts,
      text: th
        ? `ตรวจสอบแล้ว ${counts.checked} จาก ${total} รายการ พบประเด็นใน ${counts.withFindings} รายการ${sev ? ` (${sev})` : ""}${failed ? ` ตรวจสอบไม่ได้ ${failed} รายการ` : ""}`
        : `Checked ${counts.checked} of ${total} entries: ${counts.withFindings} with findings${sev ? ` (${sev})` : ""}${failed ? `, ${failed} could not be checked` : ""}.`,
    };
  }
  const counts = { translated: results.filter((r) => r.ok && !r.skipped).length, skipped: results.filter((r) => r.skipped).length, failed };
  return {
    counts,
    text: th
      ? `ส่งคำแปลเข้าตรวจทาน ${counts.translated} จาก ${total} รายการ${counts.skipped ? ` ข้าม ${counts.skipped} รายการ (มีคำแปลรอตรวจทานอยู่แล้ว)` : ""}${failed ? ` ไม่สำเร็จ ${failed} รายการ` : ""}`
      : `Filed ${counts.translated} translation review${counts.translated === 1 ? "" : "s"} for ${total} entries${counts.skipped ? `; ${counts.skipped} skipped (a translation is already in review)` : ""}${failed ? `; ${failed} failed` : ""}.`,
  };
}
