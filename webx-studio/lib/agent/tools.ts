// The WebX Agent's tool registry — every tool is implemented on top of
// governed.* (lib/cms/governance.ts), so tenant scoping, custom-role gates,
// field-policy stripping, the item plan cap, and audit logging are ALL
// inherited automatically; nothing here re-implements or bypasses any of it.
// Tests swap governed.* for an in-memory CMS through ctx.cms.
//
// Covers both content-entry tools (read/search/schema/audit/write-draft/
// translate/submit) and page-building tools (get_page_blocks/insert_blocks/
// replace_block/remove_block/list_block_types — added once
// lib/blockCatalog.ts existed to share VisualBuilder.tsx's own block-type
// catalog without a second copy).
import "server-only";
import { randomUUID } from "node:crypto";
import { governed, listGovernableContentTypes, getContentTypeSchema } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";
import { structured } from "@/lib/llm";
import { toBuilder, toWire, type Dialect } from "@/lib/blockDialect";
import { ALL_TYPES, metaOf } from "@/lib/blockCatalog";
import { auditEntry } from "./auditRules";
import { untrustedBlock } from "./prompts";
import { validateArgs } from "./validateArgs";
import { levelAtLeast, type AgentCms, type AgentRunContext, type ToolDef, type ToolMode, type AgentProposal } from "./types";

const REVIEW_UID = "api::review.review";
const PAGE_VERSION_UID = "api::page-version.page-version";
// The 3 page-shaped content types VisualBuilder.tsx itself edits (governance.ts's
// own PAGE_LIKE_UIDS is module-private — see that file's header note on why
// every cross-cutting concern lives directly in governance.ts rather than a
// separate module reaching into its internals; this one small set is
// data, not a governance decision, so a local copy here is the right call,
// not an exception to that rule).
const PAGE_UIDS = new Set(["api::page.page", "api::landing.landing", "wp:page"]);
// block.embed is a real, deliberate escape hatch for a HUMAN editor (raw
// HTML/CSS/JS, gated by governance.ts's own embedCode custom-role
// permission) — never for the agent, regardless of the calling human's own
// embedCode grant. governed.update's embedCode check reflects the HUMAN's
// permission, not "should the agent specifically be allowed to inject
// arbitrary script" — a materially different question this rejects outright.
const BLOCK_TYPE_DENY = /embed/i;
// A basic script-content heuristic applied to every string value in a
// block the agent is about to write — defense in depth alongside
// governed.update's own embedCode gate and the block.embed type-level
// block above, in case some OTHER field (e.g. a rich-text body) could
// otherwise carry a script-like payload onto a live public page.
const UNSAFE_BLOCK_STRING = /<script[\s>]|javascript:|on(?:error|load|click|mouseover|focus)\s*=/i;

// governed.* by default; tests hand the tools an in-memory CMS instead.
const governedCms: AgentCms = {
  list: (uid, query) => governed.list(uid, query),
  get: (uid, id, opts) => governed.get(uid, id, opts),
  create: (uid, data) => governed.create(uid, data),
  update: (uid, id, data, opts) => governed.update(uid, id, data, opts),
  listContentTypes: (tenantKey) => listGovernableContentTypes(tenantKey),
  contentTypeSchema: (uid) => getContentTypeSchema(uid),
};
const cmsOf = (ctx: AgentRunContext): AgentCms => ctx.cms ?? governedCms;

// AgentRunContext.dialect is a plain string (governance.ts's AgentPolicy.dialect
// comes straight from the tenant's own free-form publicTemplate field, never
// validated against the 3-value union) — cast at the one seam that needs the
// literal type, same convention VisualBuilder.tsx's own `as Dialect` casts
// already use for the identical field.
const dialectOf = (ctx: AgentRunContext): Dialect => ctx.dialect as Dialect;

function assertPageUid(uid: string) {
  if (!PAGE_UIDS.has(uid)) throw new CmsError(`"${uid}" is not a page — use write_draft_fields/create_draft_entry for content entries.`, 400);
}
function assertSafeBlockContent(v: any): void {
  if (typeof v === "string") {
    if (UNSAFE_BLOCK_STRING.test(v)) throw new CmsError("Block content contains disallowed script-like text.", 400);
    return;
  }
  if (Array.isArray(v)) { v.forEach(assertSafeBlockContent); return; }
  if (v && typeof v === "object") { for (const vv of Object.values(v)) assertSafeBlockContent(vv); }
}
/** Builds one full block object from a model-supplied {comp, fields} pair —
 * validated against the real catalog and merged onto that type's own `def`
 * template (same shape VisualBuilder.tsx's own add()/addAt() construct),
 * rather than trusting the model to hand-assemble a byte-perfect block. */
function buildBlock(comp: string, fields: Record<string, any>): Record<string, any> {
  if (BLOCK_TYPE_DENY.test(comp)) throw new CmsError(`Block type "${comp}" is not available to the agent.`, 403);
  const meta = metaOf(comp);
  if (!meta) throw new CmsError(`Unknown block type "${comp}". Call list_block_types first.`, 400);
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new CmsError("fields must be an object", 400);
  const block = { __component: comp, ...JSON.parse(JSON.stringify(meta.def || {})), ...fields };
  assertSafeBlockContent(block);
  return block;
}
/** A page-version snapshot BEFORE the agent's own edit — the exact same
 * safety net VisualBuilder.tsx's own saveVersion() creates before a human's
 * save, labelled so it's identifiable in the History panel. Never blocks
 * the real edit it's protecting if the snapshot itself fails. */
async function snapshotPageVersion(ctx: AgentRunContext, uid: string, id: string, title: string, blocks: any[]): Promise<void> {
  try {
    await cmsOf(ctx).create(PAGE_VERSION_UID, {
      documentRef: id, contentType: uid, tenantKey: ctx.tenantKey,
      label: "agent:" + ctx.runId, data: { title, blocks },
    });
  } catch { /* best-effort safety net, not a precondition for the edit */ }
}
const MAX_BLOCKS_RETURNED = 40;

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

// Strapi's real uids are always "api::<singular>.<singular>"; WordPress's
// are always "wp:<slug>". Cheap, no network call — but it catches a real
// failure mode found live: the model sees list_content_types return
// {"uid":"api::page.page", ...} and then, on the very next call, guesses a
// SHORTENED form ("page") for search_content instead of copying the exact
// string. Without this check that reaches Strapi and 404s with a bare "list
// failed" — no signal for what went wrong — and the model just keeps
// guessing different short forms turn after turn (observed: 8 guesses in a
// row — "page", "pages", "site_page", "web_page", "gov_page",
// "content_page" — before the run gave up, having never once retried
// list_content_types' own exact string it already had). This message is
// specific enough that the model corrects on the very next turn instead.
const CONTENT_TYPE_UID_RE = /^(api::[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*|wp:[a-z][a-z0-9-]*)$/;
function assertContentTypeAllowed(ctx: AgentRunContext, uid: string) {
  if (!CONTENT_TYPE_UID_RE.test(uid)) {
    throw new CmsError(
      `"${uid}" is not a valid content-type uid. Use the EXACT "uid" string a prior list_content_types call returned (e.g. "api::page.page", "api::landing.landing", "wp:page") — never a shortened, guessed, or pluralized form.`,
      400
    );
  }
  if (ctx.allowedContentTypes && !ctx.allowedContentTypes.includes(uid)) {
    throw new CmsError(`The agent is not allowed to work with ${uid} in this workspace.`, 403);
  }
}

const TOOLS: ToolDef[] = [
  {
    name: "list_content_types",
    mode: "read",
    description: "List the content types (SCOPED for this tenant's engine) the agent can read or write in this workspace. Pass each uid to other tools exactly as returned.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run(ctx) {
      const types = await cmsOf(ctx).listContentTypes(ctx.tenantKey || "");
      const allowed = ctx.allowedContentTypes ? types.filter((t) => ctx.allowedContentTypes!.includes(t.uid)) : types;
      return { summary: `${allowed.length} content type(s)`, data: allowed };
    },
  },
  {
    name: "get_content_type_schema",
    mode: "read",
    description: "Get the exact fields of one content type: type, whether required, allowed values, length limits, and whether you may set each field. Call it before creating entries of a type you have not created in this conversation, instead of reading existing entries to guess field shapes.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid"],
      properties: { uid: { type: "string" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      const schema = await cmsOf(ctx).contentTypeSchema(args.uid);
      if (!schema) throw new CmsError(`Unknown content type "${args.uid}". Use an exact uid from list_content_types.`, 404);
      const required = schema.fields.filter((f) => f.required).map((f) => f.name);
      return { summary: `${schema.fields.length} field(s)` + (required.length ? `; required: ${required.join(", ")}` : ""), data: schema };
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
      const { data, total } = await cmsOf(ctx).list<any>(args.uid, { q: args.q, pageSize: Math.min(Number(args.limit) || 10, 20) });
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
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
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
      const e: any = await cmsOf(ctx).get(args.uid, args.id);
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
      await cmsOf(ctx).update(args.uid, args.id, args.fields, { locale: args.locale });
      return { summary: `Wrote ${Object.keys(args.fields).length} field(s) as a draft`, data: { uid: args.uid, id: args.id } };
    },
  },
  {
    name: "create_draft_entry",
    mode: "draft",
    description: "Create a new entry as a DRAFT (never published). For a content type you have not created in this conversation, call get_content_type_schema first. Downgrades to a proposal under the same rules as write_draft_fields.",
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
      const created: any = await cmsOf(ctx).create(args.uid, args.fields);
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
      // Applying a translation review calls update(uid, id, fields, {locale})
      // (ReviewBoard.tsx's applyTranslation) — on a content type with no real
      // per-locale copy (Strapi's i18n plugin off, e.g. Page/Landing, which
      // Visual Builder pages use) that just overwrites the SAME single entry
      // instead of writing a second-language version. Refuse up front rather
      // than let a human "Apply" a translation that destroys the original.
      const schema = await cmsOf(ctx).contentTypeSchema(args.uid);
      if (!schema?.localized) {
        throw new CmsError(`"${args.uid}" has no separate per-locale copy (i18n isn't enabled for it), so a translation would overwrite the only copy instead of adding a second language. Create a new, separate entry with the translated content instead.`, 422);
      }
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.sourceLocale });
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
      await cmsOf(ctx).create(REVIEW_UID, {
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
      const created: any = await cmsOf(ctx).create(REVIEW_UID, {
        documentRef: args.id, contentType: args.uid, title, stage: "in_review", requestedBy: ctx.user.email || "agent", history: [entry],
      });
      return { summary: "Submitted for review", data: { reviewId: String(created?.documentId ?? created?.id ?? "") } };
    },
  },

  // ---- page-building tools ----
  {
    name: "list_block_types",
    mode: "read",
    description: "List the page-section block types available for this workspace's own site design, each with a sample field shape. Call this before insert_blocks/replace_block if you don't already know which block types exist.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run(ctx) {
      const types = ALL_TYPES.filter((ty: any) => (ty.tpl || "gov-portal") === ctx.dialect || (ty.generic && (ctx.dialect === "orst" || ctx.dialect === "royalsociety")));
      const data = types.map((ty: any) => ({ comp: ty.comp, category: ty.cat, sampleFields: ty.def }));
      return { summary: `${data.length} block type(s) for "${ctx.dialect}"`, data };
    },
  },
  {
    name: "get_page_blocks",
    mode: "read",
    description: "Read a page's current blocks (sections) in order, each with its index and field values. Use the index to target replace_block/remove_block.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id"],
      properties: { uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      assertPageUid(args.uid);
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const blocks = toBuilder((e.blocks ?? []) as any[], dialectOf(ctx)).map((b: any, index: number) => ({ index, ...b }));
      const truncated = blocks.length > MAX_BLOCKS_RETURNED;
      return {
        summary: `${blocks.length} block(s)` + (truncated ? ` (showing first ${MAX_BLOCKS_RETURNED})` : ""),
        data: { title: titleOf(e), blocks: truncated ? blocks.slice(0, MAX_BLOCKS_RETURNED) : blocks },
      };
    },
  },
  {
    name: "insert_blocks",
    mode: "draft",
    description: "Insert one or more new blocks (sections) into a page at a given position. Provide each block's type (from list_block_types) and field values — fields you don't set get that type's own sensible defaults. When an editor is already open for this exact page, this returns a proposal for a human to apply instead of writing directly.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id", "at", "blocks"],
      properties: {
        uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" },
        at: { type: "integer", minimum: 0, description: "Position to insert at — 0 inserts before the first existing block." },
        blocks: {
          type: "array", minItems: 1, maxItems: 6,
          items: { type: "object", additionalProperties: false, required: ["comp"], properties: { comp: { type: "string" }, fields: { type: "object" } } },
        },
      },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      assertPageUid(args.uid);
      const newBlocks = args.blocks.map((b: any) => buildBlock(b.comp, b.fields || {}));
      if (shouldPropose(ctx)) {
        return {
          summary: `Proposed inserting ${newBlocks.length} block(s) at position ${args.at}`,
          proposal: { id: randomUUID(), kind: "blocks", target: { uid: args.uid, id: args.id, locale: args.locale }, title: `Insert ${newBlocks.length} block(s)`, blocks: newBlocks, at: args.at },
        };
      }
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const current = toBuilder((e.blocks ?? []) as any[], dialectOf(ctx));
      const at = Math.max(0, Math.min(args.at, current.length));
      const next = [...current.slice(0, at), ...newBlocks, ...current.slice(at)];
      await snapshotPageVersion(ctx, args.uid, args.id, titleOf(e), current);
      await cmsOf(ctx).update(args.uid, args.id, { blocks: toWire(next, dialectOf(ctx)) }, { locale: args.locale });
      return { summary: `Inserted ${newBlocks.length} block(s) at position ${at}`, data: { uid: args.uid, id: args.id } };
    },
  },
  {
    name: "replace_block",
    mode: "draft",
    description: "Replace one existing block on a page (by its index from get_page_blocks) with a new block.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id", "index", "comp"],
      properties: { uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" }, index: { type: "integer", minimum: 0 }, comp: { type: "string" }, fields: { type: "object" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      assertPageUid(args.uid);
      const newBlock = buildBlock(args.comp, args.fields || {});
      if (shouldPropose(ctx)) {
        return {
          summary: `Proposed replacing block ${args.index}`,
          proposal: { id: randomUUID(), kind: "blocks", target: { uid: args.uid, id: args.id, locale: args.locale }, title: `Replace block ${args.index}`, blocks: [newBlock], replace: args.index },
        };
      }
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const current = toBuilder((e.blocks ?? []) as any[], dialectOf(ctx));
      if (args.index < 0 || args.index >= current.length) throw new CmsError(`No block at index ${args.index} (page has ${current.length}).`, 400);
      const next = current.map((b: any, i: number) => (i === args.index ? newBlock : b));
      await snapshotPageVersion(ctx, args.uid, args.id, titleOf(e), current);
      await cmsOf(ctx).update(args.uid, args.id, { blocks: toWire(next, dialectOf(ctx)) }, { locale: args.locale });
      return { summary: `Replaced block ${args.index}`, data: { uid: args.uid, id: args.id } };
    },
  },
  {
    name: "remove_block",
    mode: "draft",
    description: "Remove one existing block from a page by its index (from get_page_blocks).",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id", "index"],
      properties: { uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" }, index: { type: "integer", minimum: 0 } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      assertPageUid(args.uid);
      if (shouldPropose(ctx)) {
        return {
          summary: `Proposed removing block ${args.index}`,
          proposal: { id: randomUUID(), kind: "blocks", target: { uid: args.uid, id: args.id, locale: args.locale }, title: `Remove block ${args.index}`, blocks: [], replace: args.index },
        };
      }
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const current = toBuilder((e.blocks ?? []) as any[], dialectOf(ctx));
      if (args.index < 0 || args.index >= current.length) throw new CmsError(`No block at index ${args.index} (page has ${current.length}).`, 400);
      const next = current.filter((_: any, i: number) => i !== args.index);
      await snapshotPageVersion(ctx, args.uid, args.id, titleOf(e), current);
      await cmsOf(ctx).update(args.uid, args.id, { blocks: toWire(next, dialectOf(ctx)) }, { locale: args.locale });
      return { summary: `Removed block ${args.index}`, data: { uid: args.uid, id: args.id } };
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

/** Whether a tool can change content. The engine records a write as started
 * before running it, so a crash mid-write is reported to the model as an
 * unknown outcome instead of being retried blindly. */
export function toolIsWrite(name: string): boolean {
  const t = TOOL_BY_NAME.get(name);
  return Boolean(t && t.mode !== "read");
}

const MAX_RESULT_BYTES = 8 * 1024;
export function capResult(s: string): string {
  return s.length > MAX_RESULT_BYTES ? s.slice(0, MAX_RESULT_BYTES) + "\n…(truncated)" : s;
}

// Strapi's validation message says what was wrong; it doesn't say where the
// model can find what's right (bug 4: the model moved on to another content
// type instead of fixing the fields).
const SCHEMA_HINT_TOOLS = new Set(["create_draft_entry", "write_draft_fields"]);
function withSchemaHint(name: string, args: Record<string, any>, e: CmsError): string {
  const status = e.status ?? 0;
  if (!SCHEMA_HINT_TOOLS.has(name) || (status !== 400 && status !== 422) || typeof args.uid !== "string" || !/ failed: /.test(e.message)) return e.message;
  return `${e.message} — call get_content_type_schema with {"uid":"${args.uid}"} for the exact fields and allowed values.`;
}

/** Executes one tool call by name, re-checking everything the tool list was
 * already filtered by (a stale tool list from an earlier turn, or a model
 * hallucinating a disallowed call, must still be caught here — this is the
 * actual enforcement point, availableTools() is only what's offered). */
export async function executeTool(
  ctx: AgentRunContext, name: string, argsJson: string,
): Promise<{ ok: boolean; summary: string; data?: any; proposal?: AgentProposal; retryable?: boolean }> {
  if (DENY_NAME.test(name)) return { ok: false, summary: "This action is not available to the agent." };
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return { ok: false, summary: `Unknown tool "${name}".` };
  if (!levelAtLeast(ctx.level, MODE_MIN_LEVEL[tool.mode])) return { ok: false, summary: "This action requires a higher autonomy level than this workspace has granted the agent." };
  if (ctx.allowedTools && !ctx.allowedTools.includes(name)) return { ok: false, summary: "This tool is not enabled for the agent in this workspace." };
  let args: Record<string, any>;
  try { args = argsJson ? JSON.parse(argsJson) : {}; } catch { return { ok: false, summary: "Malformed tool arguments." }; }
  if (JSON.stringify(args).length > MAX_RESULT_BYTES) return { ok: false, summary: "Tool arguments too large." };
  const problems = validateArgs(tool.parameters, args);
  if (problems.length) return { ok: false, summary: `Invalid arguments for ${name}: ${problems.join("; ")}.` };
  try {
    const r = await tool.run(ctx, args);
    return { ok: true, summary: capResult(r.summary), data: r.data, proposal: r.proposal };
  } catch (e: any) {
    if (e instanceof CmsError) return { ok: false, summary: capResult(withSchemaHint(name, args, e)), retryable: (e.status ?? 0) >= 500 };
    return { ok: false, summary: "Tool failed unexpectedly.", retryable: true };
  }
}
