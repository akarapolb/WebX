// The WebX Agent's tool registry — every tool is implemented on top of
// governed.* (lib/cms/governance.ts), so tenant scoping, custom-role gates,
// field-policy stripping, the item plan cap, and audit logging are ALL
// inherited automatically; nothing here re-implements or bypasses any of it.
//
// Scope note (Milestone 1 — backend foundation): this registry covers
// content-entry tools only (read/search/audit/write-draft/translate/submit).
// Page-building tools (get_page_blocks, insert_blocks, list_block_types, …)
// are a deliberate follow-up — they need lib/blockCatalog.ts extracted from
// the live VisualBuilder.tsx first, which is a higher-risk edit to a large,
// already-shipped editor best done alongside its own UI wiring (Milestone 2),
// not rushed into this backend-only pass.
import "server-only";
import { randomUUID } from "node:crypto";
import { governed, listGovernableContentTypes } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";
import { structured } from "@/lib/llm";
import { auditEntry } from "./auditRules";
import { untrustedBlock } from "./prompts";
import { levelAtLeast, type AgentRunContext, type ToolDef, type ToolMode, type AgentProposal } from "./types";

const REVIEW_UID = "api::review.review";

// The level a tool's own `mode` requires to be OFFERED to the model at all.
// "draft" tools still get downgraded to a proposal at exactly "suggest" (or
// whenever the client's own context says an editor is open — applyLocally)
// — see shouldPropose() below; MODE_MIN_LEVEL only gates whether the tool
// exists in this turn's tool list in the first place.
const MODE_MIN_LEVEL: Record<ToolMode, "read" | "suggest" | "draft_submit"> = {
  read: "read", draft: "suggest", submit: "draft_submit",
};

// Defense in depth — checked again here even though no tool in this
// registry implements any of these, so a future tool addition can't
// accidentally reintroduce one without this also being edited (and reviewed).
const DENY_NAME = /publish|unpublish|delete|remove_entry|permission|role|token|rebuild|tenant/i;

function titleOf(e: any): string {
  return e?.title || e?.name || e?.subject || e?.question || e?.heading || "";
}
function bodyOf(e: any): string {
  return [e?.body, e?.content, e?.answer, e?.description].find((x) => typeof x === "string") || "";
}

/** A draft-mode tool writes for real only at "draft"/"draft_submit" AND when
 * no editor holds unsaved local state for this exact target — otherwise the
 * caller (client) gets a proposal back to apply itself. See
 * AgentContextRef's own doc comment in types.ts for why applyLocally exists. */
function shouldPropose(ctx: AgentRunContext): boolean {
  if (ctx.level === "suggest") return true;
  const ref = ctx.ref;
  return (ref.kind === "page" || ref.kind === "entry") && Boolean(ref.applyLocally);
}

function assertContentTypeAllowed(ctx: AgentRunContext, uid: string) {
  if (ctx.allowedContentTypes && !ctx.allowedContentTypes.includes(uid)) {
    throw new CmsError(`The agent is not allowed to work with ${uid} in this workspace.`, 403);
  }
}

const TOOLS: ToolDef[] = [
  {
    name: "list_content_types",
    mode: "read",
    description: "List the content types (SCOPED for this tenant's engine) the agent can read or write in this workspace.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run(ctx) {
      const types = await listGovernableContentTypes(ctx.tenantKey || "");
      const allowed = ctx.allowedContentTypes ? types.filter((t) => ctx.allowedContentTypes!.includes(t.uid)) : types;
      return { summary: `${allowed.length} content type(s)`, data: allowed };
    },
  },
  {
    name: "search_content",
    mode: "read",
    description: "Search or list entries of one content type by keyword. Returns lightweight summaries (id, title, updatedAt), not full bodies.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid"],
      properties: { uid: { type: "string" }, q: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      const { data, total } = await governed.list<any>(args.uid, { q: args.q, pageSize: Math.min(Number(args.limit) || 10, 20) });
      const rows = data.map((e: any) => ({ id: String(e.documentId ?? e.id), title: titleOf(e) || "(untitled)", updatedAt: e.updatedAt || null }));
      return { summary: `${rows.length} of ${total} match(es)`, data: rows };
    },
  },
  {
    name: "get_entry",
    mode: "read",
    description: "Fetch one entry in full by id.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id"],
      properties: { uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      const e: any = await governed.get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Entry not found", 404);
      const readable: Record<string, any> = {};
      for (const [k, v] of Object.entries(e)) {
        if (typeof v === "string" && v.length > 4000) { readable[k] = untrustedBlock(`entry:${args.uid}:${args.id}:${k}`, v); continue; }
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) readable[k] = v;
      }
      return { summary: titleOf(e) || String(args.id), data: readable };
    },
  },
  {
    name: "audit_entry",
    mode: "read",
    description: "Run accessibility / SEO / freshness / PDPA checks against one entry. Read-only.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id"],
      properties: { uid: { type: "string" }, id: { type: "string" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      const e: any = await governed.get(args.uid, args.id);
      if (!e) throw new CmsError("Entry not found", 404);
      const findings = auditEntry({
        title: titleOf(e), body: bodyOf(e),
        meta: e.seoDescription || e.excerpt || e.description || e.metaDescription || "",
        updatedAt: e.updatedAt,
      });
      return { summary: findings.length ? `${findings.length} finding(s)` : "No issues found", data: findings };
    },
  },
  {
    name: "write_draft_fields",
    mode: "draft",
    description: "Write field values onto an entry as a DRAFT. When an editor is already open for this exact entry, or the agent's level is \"suggest\", this returns a proposal for a human to apply instead of writing directly.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id", "fields"],
      properties: { uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" }, fields: { type: "object" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      if (!args.fields || typeof args.fields !== "object" || Array.isArray(args.fields)) throw new CmsError("fields must be an object", 400);
      const proposal: AgentProposal = {
        id: randomUUID(), kind: "fields", target: { uid: args.uid, id: args.id, locale: args.locale },
        title: "Field changes", fields: args.fields,
      };
      if (shouldPropose(ctx)) return { summary: `Proposed ${Object.keys(args.fields).length} field change(s)`, proposal };
      await governed.update(args.uid, args.id, args.fields, { locale: args.locale });
      return { summary: `Wrote ${Object.keys(args.fields).length} field(s) as a draft`, data: { uid: args.uid, id: args.id } };
    },
  },
  {
    name: "create_draft_entry",
    mode: "draft",
    description: "Create a new entry as a DRAFT (never published). Downgrades to a proposal under the same rules as write_draft_fields.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "fields"],
      properties: { uid: { type: "string" }, fields: { type: "object" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      if (!args.fields || typeof args.fields !== "object" || Array.isArray(args.fields)) throw new CmsError("fields must be an object", 400);
      if (shouldPropose(ctx)) {
        return {
          summary: "Proposed a new draft entry",
          proposal: { id: randomUUID(), kind: "fields", target: { uid: args.uid, id: "" }, title: titleOf(args.fields) || "New entry", fields: args.fields },
        };
      }
      const created: any = await governed.create(args.uid, args.fields);
      return { summary: `Created a draft ${args.uid}`, data: { uid: args.uid, id: String(created?.documentId ?? created?.id ?? "") } };
    },
  },
  {
    name: "translate_fields",
    mode: "draft",
    description: "Translate an entry's text fields into another locale. Never writes the entry directly — files a translation review a human applies from the Reviews board (or, at \"suggest\" level, returns a preview only).",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id", "targetLocale"],
      properties: { uid: { type: "string" }, id: { type: "string" }, sourceLocale: { type: "string" }, targetLocale: { type: "string" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      const e: any = await governed.get(args.uid, args.id, { locale: args.sourceLocale });
      if (!e) throw new CmsError("Entry not found", 404);
      const CAND = ["title", "name", "subject", "question", "categoryLabel", "excerpt", "summary", "description", "answer", "body", "content"];
      const source: Record<string, string> = {};
      for (const k of CAND) { const v = e[k]; if (typeof v === "string" && v.trim()) source[k] = v; }
      if (!Object.keys(source).length) throw new CmsError("No translatable text fields on this entry", 422);
      const langName = String(args.targetLocale).toLowerCase().startsWith("en") ? "English" : "Thai";
      const out = await structured<{ fields: Record<string, string> }>({
        system: `You are a professional translator for public-sector web content. Translate each field value into ${langName}, preserving meaning, a formal public-sector tone, and any HTML tags exactly. Do NOT translate proper nouns or acronyms. Return the same JSON keys with translated values only.`,
        prompt: "Translate these fields to " + langName + ":\n" + JSON.stringify(source),
        schema: { type: "object", additionalProperties: false, required: ["fields"], properties: { fields: { type: "object", additionalProperties: { type: "string" } } } },
        cache: true,
      }).catch(() => null);
      const fields: Record<string, string> = {};
      for (const k of Object.keys(source)) { const v = out?.fields?.[k]; if (typeof v === "string" && v.trim()) fields[k] = v; }
      if (!Object.keys(fields).length) throw new CmsError("Translation produced nothing usable", 502);
      if (ctx.level === "suggest") {
        return {
          summary: `Translated ${Object.keys(fields).length} field(s) to ${args.targetLocale} (preview only)`,
          proposal: { id: randomUUID(), kind: "fields", target: { uid: args.uid, id: args.id, locale: args.targetLocale }, title: "Translation preview", fields },
        };
      }
      const title = "[" + String(args.targetLocale).toUpperCase() + "] " + (source.title || source.name || args.id.slice(0, 8));
      await governed.create(REVIEW_UID, {
        documentRef: args.id, contentType: args.uid, title, stage: "in_review", kind: "translation",
        requestedBy: ctx.user.email || "agent",
        note: "Agent draft translation -> " + args.targetLocale + ". Review, then Apply to write the " + args.targetLocale + " locale.",
        payload: { targetLocale: args.targetLocale, sourceLocale: args.sourceLocale || "", fields },
        history: [{ to: "in_review", by: ctx.user.email || "agent", at: new Date().toISOString() }],
      });
      return { summary: `Filed a translation review for ${args.targetLocale}`, data: { uid: args.uid, id: args.id, targetLocale: args.targetLocale } };
    },
  },
  {
    name: "submit_for_review",
    mode: "submit",
    description: "Submit an entry for human review. This is the ONLY way content the agent touched can move toward publish — the agent itself can never publish.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id"],
      properties: { uid: { type: "string" }, id: { type: "string" }, title: { type: "string" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      const title = args.title || args.id.slice(0, 8);
      const entry = { from: "draft", to: "in_review", by: ctx.user.email || "agent", at: new Date().toISOString() };
      const created: any = await governed.create(REVIEW_UID, {
        documentRef: args.id, contentType: args.uid, title, stage: "in_review", requestedBy: ctx.user.email || "agent", history: [entry],
      });
      return { summary: "Submitted for review", data: { reviewId: String(created?.documentId ?? created?.id ?? "") } };
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Tool list offered to the model THIS turn — filtered by the resolved level
 * and the tenant/role's own allowlist, so a disallowed tool is never even
 * visible to the model, not just rejected if called. */
export function availableTools(ctx: AgentRunContext) {
  return TOOLS.filter((t) => {
    if (DENY_NAME.test(t.name)) return false; // unreachable given the registry above, kept as a real assertion, not a comment
    if (!levelAtLeast(ctx.level, MODE_MIN_LEVEL[t.mode])) return false;
    if (ctx.allowedTools && !ctx.allowedTools.includes(t.name)) return false;
    return true;
  });
}

export function toolSpecs(ctx: AgentRunContext) {
  return availableTools(ctx).map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

const MAX_RESULT_BYTES = 8 * 1024;
function capResult(s: string): string {
  return s.length > MAX_RESULT_BYTES ? s.slice(0, MAX_RESULT_BYTES) + "\n…(truncated)" : s;
}

/** Executes one tool call by name, re-checking everything the tool list was
 * already filtered by (a stale tool list from an earlier turn, or a model
 * hallucinating a disallowed call, must still be caught here — this is the
 * actual enforcement point, availableTools() is only what's offered). */
export async function executeTool(ctx: AgentRunContext, name: string, argsJson: string): Promise<{ ok: boolean; summary: string; data?: any; proposal?: AgentProposal }> {
  if (DENY_NAME.test(name)) return { ok: false, summary: "This action is not available to the agent." };
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return { ok: false, summary: `Unknown tool "${name}".` };
  if (!levelAtLeast(ctx.level, MODE_MIN_LEVEL[tool.mode])) return { ok: false, summary: "This action requires a higher autonomy level than this workspace has granted the agent." };
  if (ctx.allowedTools && !ctx.allowedTools.includes(name)) return { ok: false, summary: "This tool is not enabled for the agent in this workspace." };
  let args: Record<string, any>;
  try { args = argsJson ? JSON.parse(argsJson) : {}; } catch { return { ok: false, summary: "Malformed tool arguments." }; }
  if (JSON.stringify(args).length > MAX_RESULT_BYTES) return { ok: false, summary: "Tool arguments too large." };
  try {
    const r = await tool.run(ctx, args);
    return { ok: true, summary: capResult(r.summary), data: r.data, proposal: r.proposal };
  } catch (e: any) {
    if (e instanceof CmsError) return { ok: false, summary: e.message };
    return { ok: false, summary: "Tool failed unexpectedly." };
  }
}
