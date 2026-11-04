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
import { MUI_VIEW_BOX, muiIconByName, searchMuiIcons } from "@/lib/muiIcons";
import { FEATURE_ICONS } from "@/components/blockPreview/iconChoices";
import { auditEntry } from "./auditRules";
import { untrustedBlock } from "./prompts";
import { validateArgs } from "./validateArgs";
import { resolveBackgroundImageFromUrl } from "./urlImage";
import { fetchWordpressPage } from "./wordpressImport";
import { fetchUrlPageContent } from "./pageContent";
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
// Block types with a real image-backed background, verified against their
// actual render component (blockPreview/blocks.tsx's HeroBlock/ImageBlock,
// both keyed on `b.image` via that file's mediaUrl()) — NOT declared in
// blockCatalog.ts's own `fields` list (that upload affordance is hardcoded
// into each component's JSX, not a generic schema field the sidebar form or
// metaOf() knows about), so set_block_background_image keeps its own small
// hand-verified map here instead of trusting metaOf() the way set_block_style
// trusts it for variant/tone.
const BLOCK_BACKGROUND_IMAGE_FIELD: Record<string, string> = {
  "block.hero": "image",
  "block.image": "image",
};
// Shared by both import tools' descriptions: imported content comes back in
// two shapes because the two engines' block palettes accept different ones
// (see lib/agent/htmlText.ts). Saying so in the tool description is what
// stops a WordPress-dialect run from trying to push raw HTML into a field
// that only takes escaped strings.
const IMPORT_SHAPE_HINT =
  "Returns the content twice: `bodyHtml` (sanitized HTML — use it for a gov-portal tenant's `block.richtext` `body` field) and `paragraphs` (a plain string array — use it for a WordPress-dialect tenant's `orst.rich-text`/`orst.two-column` `paragraphs`, or any structured item list, since those palettes accept NO raw HTML). Call list_block_types first if unsure which applies to this workspace.";
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
/** translate_fields's CAND list only ever matched Page/Landing's own
 * `title` — everything else a Visual Builder page actually says lives
 * inside `blocks[]`, so "translate this page" translated almost nothing.
 * Walks every known block (blockCatalog.ts's metaOf, the SAME registry
 * buildBlock() above uses) all the way down — items, tabs inside tabs, a
 * featured story — and returns the translatable strings keyed by path
 * ("blocks.<index>.<path>"). With `target`, only strings that need that
 * language are returned. `code` fields (block.embed's raw html) are never
 * translated — that's script content, not copy. */
export function extractBlockTranslatable(blocks: any[], target?: string): Record<string, string> {
  const out: Record<string, string> = {};
  const want = wantsTranslation(target);
  blocks.forEach((b, i) => {
    const meta = metaOf(b?.__component);
    if (!meta) return;
    const codeKeys = new Set((meta.fields || []).filter((f: any) => f.code).map((f: any) => f.k));
    // Any string anywhere in the block can be copy — items, tabs inside tabs, a featured story —
    // so walk the whole block rather than only the fields the catalog lists. Keys are paths like
    // "blocks.<i>.tabs.0.items.2.title"; links, icons, images, ids, code and choices stay as they are.
    const walk = (v: unknown, path: string, key: string, depth: number) => {
      if (typeof v === "string") {
        if (isCopyKey(key, depth) && isCopy(v) && want(v)) out[path] = v;
      } else if (Array.isArray(v)) {
        v.forEach((x, n) => walk(x, path + "." + n, key, depth + 1));
      } else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          if (depth === 0 && (k === "type" || k === "__component" || codeKeys.has(k))) continue;
          walk(x, path + "." + k, k, depth + 1);
        }
      }
    };
    walk(b, "blocks." + i, "", 0);
  });
  return out;
}
// A key holds copy unless it is an id, link, image, icon or a choice from a list.
const NOT_COPY_KEY = /(^|[a-z])(href|url|image|img|src|icon|id|key|email|phone|tel|link|slug)$/i;
const CHOICE_KEY = /^(variant|tone|layout|columns|align|theme|size|style)$/i;
const isCopyKey = (key: string, depth: number) => depth === 0 || (!NOT_COPY_KEY.test(key) && !CHOICE_KEY.test(key));
const isCopy = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && !/^(https?:|\/|#|mailto:|tel:)/i.test(v.trim());
const THAI_CHAR = /[฀-๿]/;
/** Which strings need translating into `target`: into English only the ones with Thai in them, into
 * Thai only the ones with Latin letters and no Thai. With no target, every string. */
function wantsTranslation(target?: string): (s: string) => boolean {
  if (!target) return () => true;
  return /^en([-_]|$)/i.test(target) ? (s) => THAI_CHAR.test(s) : (s) => !THAI_CHAR.test(s) && /[A-Za-z]{2}/.test(s);
}

/** The inverse of extractBlockTranslatable — writes translated values back
 * onto a copy of the builder-shape blocks array at the same paths. Only the
 * touched blocks are copied, and every other field and item is left as it was. */
export function applyBlockTranslations(blocks: any[], translated: Record<string, string>): any[] {
  const next = blocks.slice();
  const cloned = new Set<number>();
  for (const [path, v] of Object.entries(translated)) {
    const m = /^blocks\.(\d+)\.(.+)$/.exec(path);
    if (!m) continue;
    const i = Number(m[1]);
    if (!next[i]) continue;
    if (!cloned.has(i)) { next[i] = JSON.parse(JSON.stringify(next[i])); cloned.add(i); }
    const parts = m[2].split(".");
    let node: any = next[i];
    for (const p of parts.slice(0, -1)) node = node?.[p];
    const last = parts[parts.length - 1];
    if (node && typeof node === "object" && last in node) node[last] = v;
    else if (parts.length === 1 && node) node[last] = v;
  }
  return next;
}
/** A page-version snapshot BEFORE the agent's own edit — the exact same
 * safety net VisualBuilder.tsx's own saveVersion() creates before a human's
 * save, labelled so it's identifiable in the History panel. Never blocks
 * the real edit it's protecting if the snapshot itself fails. */
async function snapshotPageVersion(ctx: AgentRunContext, uid: string, id: string, title: string, blocks: any[], field: "blocks" | "blocks_en" = "blocks"): Promise<void> {
  try {
    // The History panel restores `data.blocks` into whichever layout is open, so an
    // English snapshot is stored the same way and tagged in its label.
    await cmsOf(ctx).create(PAGE_VERSION_UID, {
      documentRef: id, contentType: uid, tenantKey: ctx.tenantKey,
      label: "agent:" + ctx.runId + (field === "blocks_en" ? " (EN)" : ""), data: { title, blocks },
    });
  } catch { /* best-effort safety net, not a precondition for the edit */ }
}
const MAX_BLOCKS_RETURNED = 40;
// One translation request carries at most this many strings / characters.
const TRANSLATE_BATCH_KEYS = 40;
const TRANSLATE_BATCH_CHARS = 5000;

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

const ICON_UID = "api::icon.icon";
const BUILTIN_ICON_RE = /^i-[a-z0-9-]{1,40}$/;

/** The workspace's saved icons (governed.*, so the tenant's own only). */
async function savedIcons(ctx: AgentRunContext): Promise<{ key: string; name: string; svg: string }[]> {
  try {
    const { data } = await cmsOf(ctx).list<any>(ICON_UID, { pageSize: 100 });
    return data.filter((i: any) => typeof i?.key === "string").map((i: any) => ({ key: i.key, name: String(i.name || i.key), svg: String(i.svg || "") }));
  } catch {
    return [];
  }
}

/** What to store in an item's icon field for `icon`: a built-in id or a saved
 * icon's key as is, or a Material icon saved to the library first — the same
 * record the icon picker creates, reusing an identical one if it exists. */
async function resolveIconValue(ctx: AgentRunContext, icon: string): Promise<string> {
  const raw = icon.trim();
  if (BUILTIN_ICON_RE.test(raw)) return raw;
  const saved = await savedIcons(ctx);
  const m = /^material:\s*(.+)$/i.exec(raw);
  if (!m) {
    if (saved.some((i) => i.key === raw)) return raw;
    throw new CmsError(`Unknown icon "${raw}". Use a built-in id like "i-book", a saved icon's key, or "material:<Name>" — find_icons lists them.`, 400);
  }
  const found = muiIconByName(m[1]);
  if (!found) {
    const near = searchMuiIcons(m[1], 5).icons.map((i) => i.name);
    throw new CmsError(`No Material icon named "${m[1].trim()}".` + (near.length ? ` Close matches: ${near.join(", ")}.` : ""), 404);
  }
  const existing = saved.find((i) => i.svg === found.svg);
  if (existing) return existing.key;
  if (ctx.level === "suggest") throw new CmsError("Adding a new icon to the workspace's library needs a higher agent level than SUGGEST.", 403);
  assertContentTypeAllowed(ctx, ICON_UID);
  const kebab = found.name.replace(/([a-z\d])([A-Z])/g, "$1-$2").toLowerCase();
  const key = `mui-${kebab}-${randomUUID().slice(0, 4)}`;
  await cmsOf(ctx).create(ICON_UID, { name: found.name, key, svg: found.svg, viewBox: MUI_VIEW_BOX });
  return key;
}

/** The title of the page or entry the user has open, for the system prompt. A
 * missing, forbidden or untitled target gives "" and the prompt falls back to
 * ids; the title is shortened to one line because it is stored content. */
export async function openEditorTitle(ctx: AgentRunContext): Promise<string> {
  const ref = ctx.ref;
  if (ref.kind !== "page" && ref.kind !== "entry") return "";
  try {
    assertContentTypeAllowed(ctx, ref.uid);
    const e: any = await cmsOf(ctx).get(ref.uid, ref.docId, { locale: ref.locale });
    const t = typeof titleOf(e) === "string" ? titleOf(e) : "";
    return t.replace(/\s+/g, " ").trim().slice(0, 120);
  } catch {
    return "";
  }
}

/** A draft-mode tool writes for real only at "draft"/"draft_submit" AND when
 * no editor holds unsaved local state for this exact target — otherwise the
 * caller (client) gets a proposal back to apply itself. See
 * AgentContextRef's own doc comment in types.ts for why applyLocally exists. */
function shouldPropose(ctx: AgentRunContext, target?: { uid?: string; locale?: string }): boolean {
  if (ctx.level === "suggest") return true;
  const ref = ctx.ref;
  if (!((ref.kind === "page" || ref.kind === "entry") && ref.applyLocally)) return false;
  // A WordPress page's English layout is a separate field from the Thai one the
  // open editor holds, so writing it cannot clobber the editor's unsaved state,
  // and a proposal would land on the wrong canvas.
  if (target?.uid === "wp:page" && ref.uid === "wp:page" && blocksField("wp:page", target.locale) !== blocksField("wp:page", ref.locale)) return false;
  return true;
}

/** The field a page's blocks live in. A WordPress page keeps its English layout
 * in the sibling `blocks_en` of the SAME entry (the Visual Builder's EN toggle,
 * the public site's /en/ routes); every other page type has just `blocks`. */
function blocksField(uid: string, locale?: string): "blocks" | "blocks_en" {
  return uid === "wp:page" && /^en([-_]|$)/i.test(String(locale || "")) ? "blocks_en" : "blocks";
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
    description: "Write field values onto an entry as a DRAFT. When an editor is already open for this exact entry, or the agent's level is \"suggest\", this returns a proposal for a human to apply instead of writing directly. On a content type with a real per-locale copy (check get_content_type_schema's `localized`), passing a `locale` this entry doesn't have yet CREATES that locale (e.g. add an English version of an existing Thai page) — call this once with at least `title` before insert_blocks can add that locale's blocks.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id", "fields"],
      properties: { uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" }, fields: { type: "object" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      if (!args.fields || typeof args.fields !== "object" || Array.isArray(args.fields)) throw new CmsError("fields must be an object", 400);
      // A raw blocks array skips the block catalog, drops what the model did not repeat
      // (found live: an English layout lost every item) and takes no version snapshot.
      const rawBlocks = PAGE_UIDS.has(args.uid) ? ["blocks", "blocks_en"].find((k) => k in args.fields) : undefined;
      if (rawBlocks) {
        throw new CmsError(`Do not write "${rawBlocks}" with write_draft_fields. Use insert_blocks, replace_block, remove_block, set_block_style or set_block_item_icons (pass locale "en" for a WordPress page's English layout), or translate_fields to translate the whole page.`, 400);
      }
      const proposal: AgentProposal = {
        id: randomUUID(), kind: "fields", target: { uid: args.uid, id: args.id, locale: args.locale },
        title: "Field changes", fields: args.fields,
      };
      if (shouldPropose(ctx, args)) return { summary: `Proposed ${Object.keys(args.fields).length} field change(s)`, proposal };
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
      if (shouldPropose(ctx, args)) {
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
    description: "Translate an entry's text fields into another locale, including a page's own blocks[] content (headings, body text, CTA labels, and the text inside items such as feature or card lists; links, icons and images are kept). For a WordPress page, targetLocale \"en\" translates the Thai layout into the same page's English layout (blocks_en) — do NOT create a new page for a translation. Never writes the entry directly — files a translation review a human applies from the Reviews board (or, at \"suggest\" level, returns a preview only).",
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
      // A WordPress page is the exception: its English version is the `blocks_en` field of the
      // same entry (Visual Builder's EN toggle, the site's /en/ routes), so it can be translated.
      const wpEnglish = blocksField(args.uid, args.targetLocale) === "blocks_en";
      const schema = wpEnglish ? null : await cmsOf(ctx).contentTypeSchema(args.uid);
      if (!wpEnglish && !schema?.localized) {
        throw new CmsError(`"${args.uid}" has no separate per-locale copy (i18n isn't enabled for it), so a translation would overwrite the only copy instead of adding a second language. Create a new, separate entry with the translated content instead.`, 422);
      }
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.sourceLocale });
      if (!e) throw new CmsError("Entry not found", 404);
      const CAND = ["title", "name", "subject", "question", "categoryLabel", "excerpt", "summary", "description", "answer", "body", "content"];
      const source: Record<string, string> = {};
      // Not for a WordPress page's English layout: the page title is one value shared by both
      // languages, and applying a translated title would overwrite the Thai one.
      if (!wpEnglish) for (const k of CAND) { const v = e[k]; if (typeof v === "string" && v.trim()) source[k] = v; }
      // Page/Landing's own real content lives in blocks[], not the flat CAND
      // list above (their only CAND match is `title`) — walk it too, in the
      // SAME builder shape get_page_blocks/insert_blocks use, keyed
      // "blocks.<index>.<field>" so it round-trips through one flat
      // translation call alongside the plain fields above.
      const blockList = Array.isArray(e.blocks) ? toBuilder(e.blocks, dialectOf(ctx)) : null;
      if (blockList) Object.assign(source, extractBlockTranslatable(blockList, args.targetLocale));
      if (!Object.keys(source).length) throw new CmsError("No translatable text fields on this entry", 422);
      const langName = String(args.targetLocale).toLowerCase().startsWith("en") ? "English" : "Thai";
      // A whole page is hundreds of strings; one reply that long gets cut off, so ask in batches.
      const translated: Record<string, string> = {};
      const batches: Record<string, string>[] = [];
      let cur: Record<string, string> = {}, chars = 0;
      for (const [k, v] of Object.entries(source)) {
        if (Object.keys(cur).length >= TRANSLATE_BATCH_KEYS || (chars + v.length > TRANSLATE_BATCH_CHARS && chars > 0)) { batches.push(cur); cur = {}; chars = 0; }
        cur[k] = v; chars += v.length;
      }
      if (Object.keys(cur).length) batches.push(cur);
      for (const batch of batches) {
        const out = await structured<{ fields: Record<string, string> }>({
          system: `You are a professional translator for public-sector web content. Translate each field value into ${langName}, preserving meaning, a formal public-sector tone, and any HTML tags exactly. Do NOT translate proper nouns or acronyms. Return the same JSON keys with translated values only.`,
          prompt: "Translate these fields to " + langName + ":\n" + JSON.stringify(batch),
          schema: { type: "object", additionalProperties: false, required: ["fields"], properties: { fields: { type: "object", additionalProperties: { type: "string" } } } },
          cache: true,
        }).catch(() => null);
        for (const k of Object.keys(batch)) { const v = out?.fields?.[k]; if (typeof v === "string" && v.trim()) translated[k] = v; }
      }
      if (!Object.keys(translated).length) throw new CmsError("Translation produced nothing usable", 502);
      const missed = Object.keys(source).length - Object.keys(translated).length;
      // Reassemble: plain top-level keys go straight onto `fields`; any
      // "blocks.N.key" entries get folded back into a real blocks[] array
      // (wire shape, via toWire) as a single `fields.blocks` value — a
      // translation review's payload has to be a normal fields object
      // ReviewBoard.tsx's applyTranslation can update() with directly, not
      // the dotted intermediate shape used only for the LLM round trip.
      const fields: Record<string, any> = {};
      const blockTranslations: Record<string, string> = {};
      for (const [k, v] of Object.entries(translated)) {
        if (k.startsWith("blocks.")) blockTranslations[k] = v; else fields[k] = v;
      }
      if (blockList && Object.keys(blockTranslations).length) {
        // Same blocks, same fields and items: only the text changes. For a WordPress page
        // the result is the whole English layout, replacing blocks_en when a human applies it.
        fields[wpEnglish ? "blocks_en" : "blocks"] = toWire(applyBlockTranslations(blockList, blockTranslations), dialectOf(ctx));
      }
      if (ctx.level === "suggest") {
        return {
          summary: `Translated ${Object.keys(translated).length} field(s) to ${args.targetLocale} (preview only)`,
          proposal: { id: randomUUID(), kind: "fields", target: { uid: args.uid, id: args.id, locale: args.targetLocale }, title: "Translation preview", fields },
        };
      }
      const title = "[" + String(args.targetLocale).toUpperCase() + "] " + (source.title || source.name || titleOf(e) || args.id.slice(0, 8));
      const existingEn = wpEnglish && Array.isArray(e.blocks_en) && e.blocks_en.length > 0;
      await cmsOf(ctx).create(REVIEW_UID, {
        documentRef: args.id, contentType: args.uid, title, stage: "in_review", kind: "translation",
        requestedBy: ctx.user.email || "agent",
        note: "Agent draft translation -> " + args.targetLocale + ". Review, then Apply to write the " + args.targetLocale + " locale."
          + (existingEn ? " Applying REPLACES the page's existing English layout (blocks_en) with this translation of the Thai blocks." : ""),
        payload: { targetLocale: args.targetLocale, sourceLocale: args.sourceLocale || "", fields },
        history: [{ to: "in_review", by: ctx.user.email || "agent", at: new Date().toISOString() }],
      });
      return {
        summary: `Filed a translation review for ${args.targetLocale}` + (missed > 0 ? ` — ${missed} of ${Object.keys(source).length} text(s) could not be translated and stay in the original language` : ""),
        data: { uid: args.uid, id: args.id, targetLocale: args.targetLocale, translated: Object.keys(translated).length, untranslated: missed },
      };
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
      const types = ALL_TYPES.filter((ty: any) => !ty.noPalette && ((ty.tpl || "gov-portal") === ctx.dialect || (ty.generic && (ctx.dialect === "orst" || ctx.dialect === "royalsociety"))));
      const data = types.map((ty: any) => ({ comp: ty.comp, category: ty.cat, sampleFields: ty.def }));
      return { summary: `${data.length} block type(s) for "${ctx.dialect}"`, data };
    },
  },
  {
    name: "get_page_blocks",
    mode: "read",
    description: "Read a page's current blocks (sections) in order, each with its index and field values. Use the index to target replace_block/remove_block. For a WordPress page, locale \"en\" reads its English layout (blocks_en); leave locale out for the Thai one. The block tools (insert_blocks, replace_block, remove_block, set_block_style, set_block_item_icons) take the same locale.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id"],
      properties: { uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      assertPageUid(args.uid);
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const blocks = toBuilder((e[blocksField(args.uid, args.locale)] ?? []) as any[], dialectOf(ctx)).map((b: any, index: number) => ({ index, ...b }));
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
    description: "Insert one or more new blocks (sections) into a page at a given position. Provide each block's type (from list_block_types) and field values — fields you don't set get that type's own sensible defaults. When an editor is already open for this exact page, this returns a proposal for a human to apply instead of writing directly. `locale` must already exist for this page (write_draft_fields creates a new locale; this tool never does) — it fails with \"Page not found\" otherwise.",
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
      if (shouldPropose(ctx, args)) {
        return {
          summary: `Proposed inserting ${newBlocks.length} block(s) at position ${args.at}`,
          proposal: { id: randomUUID(), kind: "blocks", target: { uid: args.uid, id: args.id, locale: args.locale }, title: `Insert ${newBlocks.length} block(s)`, blocks: newBlocks, at: args.at },
        };
      }
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const current = toBuilder((e[blocksField(args.uid, args.locale)] ?? []) as any[], dialectOf(ctx));
      const at = Math.max(0, Math.min(args.at, current.length));
      const next = [...current.slice(0, at), ...newBlocks, ...current.slice(at)];
      await snapshotPageVersion(ctx, args.uid, args.id, titleOf(e), current, blocksField(args.uid, args.locale));
      await cmsOf(ctx).update(args.uid, args.id, { [blocksField(args.uid, args.locale)]: toWire(next, dialectOf(ctx)) }, { locale: args.locale });
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
      if (shouldPropose(ctx, args)) {
        return {
          summary: `Proposed replacing block ${args.index}`,
          proposal: { id: randomUUID(), kind: "blocks", target: { uid: args.uid, id: args.id, locale: args.locale }, title: `Replace block ${args.index}`, blocks: [newBlock], replace: args.index },
        };
      }
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const current = toBuilder((e[blocksField(args.uid, args.locale)] ?? []) as any[], dialectOf(ctx));
      if (args.index < 0 || args.index >= current.length) throw new CmsError(`No block at index ${args.index} (page has ${current.length}).`, 400);
      const next = current.map((b: any, i: number) => (i === args.index ? newBlock : b));
      await snapshotPageVersion(ctx, args.uid, args.id, titleOf(e), current, blocksField(args.uid, args.locale));
      await cmsOf(ctx).update(args.uid, args.id, { [blocksField(args.uid, args.locale)]: toWire(next, dialectOf(ctx)) }, { locale: args.locale });
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
      if (shouldPropose(ctx, args)) {
        return {
          summary: `Proposed removing block ${args.index}`,
          proposal: { id: randomUUID(), kind: "blocks", target: { uid: args.uid, id: args.id, locale: args.locale }, title: `Remove block ${args.index}`, blocks: [], replace: args.index },
        };
      }
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const current = toBuilder((e[blocksField(args.uid, args.locale)] ?? []) as any[], dialectOf(ctx));
      if (args.index < 0 || args.index >= current.length) throw new CmsError(`No block at index ${args.index} (page has ${current.length}).`, 400);
      const next = current.filter((_: any, i: number) => i !== args.index);
      await snapshotPageVersion(ctx, args.uid, args.id, titleOf(e), current, blocksField(args.uid, args.locale));
      await cmsOf(ctx).update(args.uid, args.id, { [blocksField(args.uid, args.locale)]: toWire(next, dialectOf(ctx)) }, { locale: args.locale });
      return { summary: `Removed block ${args.index}`, data: { uid: args.uid, id: args.id } };
    },
  },
  {
    name: "set_block_style",
    mode: "draft",
    description: "Change one existing block's own built-in style option (its `variant` or `tone` field — a color/tone/layout accent already defined for that block type) without touching any other field on it. Unlike replace_block (which rebuilds the whole block from that type's defaults), this merges onto the block's REAL current content. Only some block types declare this option at all — call get_page_blocks to see the block's own type at this index, then list_block_types to check whether that type's sample fields include a variant/tone before calling this; the error message lists the allowed values if you guess wrong or the type has none.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id", "index", "value"],
      properties: { uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" }, index: { type: "integer", minimum: 0 }, value: { type: "string" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      assertPageUid(args.uid);
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const current = toBuilder((e[blocksField(args.uid, args.locale)] ?? []) as any[], dialectOf(ctx));
      if (args.index < 0 || args.index >= current.length) throw new CmsError(`No block at index ${args.index} (page has ${current.length}).`, 400);
      const block = current[args.index];
      const meta = metaOf(block.__component);
      const styleField = meta?.fields.find((f: any) => f.k === "variant" || f.k === "tone");
      if (!styleField) throw new CmsError(`Block type "${block.__component}" has no style option (variant/tone) to change.`, 400);
      if (styleField.select && !styleField.select.includes(args.value)) {
        throw new CmsError(`"${args.value}" is not a valid ${styleField.k} for "${block.__component}" — allowed: ${styleField.select.map((s: string) => s || "(default)").join(", ")}`, 400);
      }
      const updated = { ...block, [styleField.k]: args.value };
      if (shouldPropose(ctx, args)) {
        return {
          summary: `Proposed changing ${styleField.k} to "${args.value}"`,
          proposal: { id: randomUUID(), kind: "blocks", target: { uid: args.uid, id: args.id, locale: args.locale }, title: `Change ${styleField.k} to "${args.value}"`, blocks: [updated], replace: args.index },
        };
      }
      const next = current.map((b: any, i: number) => (i === args.index ? updated : b));
      await snapshotPageVersion(ctx, args.uid, args.id, titleOf(e), current, blocksField(args.uid, args.locale));
      await cmsOf(ctx).update(args.uid, args.id, { [blocksField(args.uid, args.locale)]: toWire(next, dialectOf(ctx)) }, { locale: args.locale });
      return { summary: `Changed ${styleField.k} to "${args.value}" on block ${args.index}`, data: { uid: args.uid, id: args.id } };
    },
  },
  {
    name: "set_block_background_image",
    mode: "draft",
    description: "Set an existing block's background/main image from a URL a human pasted — either a direct image link, or an ordinary webpage link (that page's own og:image is used instead of rendering it). Only works for block types with a real image-backed background (currently block.hero and block.image) — the error message says so if this block type has none. Fetches the URL server-side first to confirm it resolves to a real, public, reasonably-sized image before saving anything; merges onto the block's real current content, so its other fields (heading, text, …) are preserved.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id", "index", "url"],
      properties: { uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" }, index: { type: "integer", minimum: 0 }, url: { type: "string" } },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      assertPageUid(args.uid);
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const current = toBuilder((e[blocksField(args.uid, args.locale)] ?? []) as any[], dialectOf(ctx));
      if (args.index < 0 || args.index >= current.length) throw new CmsError(`No block at index ${args.index} (page has ${current.length}).`, 400);
      const block = current[args.index];
      const imageField = BLOCK_BACKGROUND_IMAGE_FIELD[block.__component];
      if (!imageField) throw new CmsError(`Block type "${block.__component}" has no image-backed background to set.`, 400);
      const resolvedUrl = await resolveBackgroundImageFromUrl(args.url);
      const updated = { ...block, [imageField]: { url: resolvedUrl } };
      assertSafeBlockContent(updated);
      if (shouldPropose(ctx, args)) {
        return {
          summary: `Proposed setting the background image from "${args.url}"`,
          proposal: { id: randomUUID(), kind: "blocks", target: { uid: args.uid, id: args.id, locale: args.locale }, title: "Set background image", blocks: [updated], replace: args.index },
        };
      }
      const next = current.map((b: any, i: number) => (i === args.index ? updated : b));
      await snapshotPageVersion(ctx, args.uid, args.id, titleOf(e), current, blocksField(args.uid, args.locale));
      await cmsOf(ctx).update(args.uid, args.id, { [blocksField(args.uid, args.locale)]: toWire(next, dialectOf(ctx)) }, { locale: args.locale });
      return { summary: `Set background image on block ${args.index} from "${args.url}"`, data: { uid: args.uid, id: args.id, imageUrl: resolvedUrl } };
    },
  },
  {
    name: "find_icons",
    mode: "read",
    description: "Look up icons for set_block_item_icons. Returns the workspace's saved icons (key + name), the built-in icon ids, and — when `q` is given — Material icon names matching it (e.g. q \"apple\" finds \"Apple\"). Call this when the user names an icon, to see whether it is already saved or must be added from the Material set.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: { q: { type: "string", description: "Words to search for, such as \"apple\" or \"home\"." } },
    },
    async run(ctx, args) {
      const q = String(args.q || "").trim().toLowerCase();
      const saved = await savedIcons(ctx);
      const library = saved
        .filter((i) => !q || `${i.name} ${i.key}`.toLowerCase().includes(q))
        .slice(0, 30).map((i) => ({ key: i.key, name: i.name }));
      const material = q ? searchMuiIcons(q, 12).icons.map((i) => i.name) : [];
      return {
        summary: `${library.length} saved, ${material.length} Material match(es)`,
        data: { library, material, builtIn: FEATURE_ICONS, usage: "Pass a built-in id as is, a saved icon's key as is, or \"material:<Name>\" to add a Material icon." },
      };
    },
  },
  {
    name: "set_block_item_icons",
    mode: "draft",
    description: "Set the icon of the items inside one existing block (a feature list, card grid, trust strip, stat row, …) without touching their titles or text. `icon` is a built-in id (e.g. \"i-book\"), a saved icon's key, or \"material:<Name>\" (e.g. \"material:Apple\") — a Material icon is added to the workspace's saved icons first if it is not there yet. Omit `items` to change every item, or list item positions (0 = first) to change only those. Only blocks whose items have an icon support this; the error says so otherwise. Use find_icons first if you are unsure of the name.",
    parameters: {
      type: "object", additionalProperties: false, required: ["uid", "id", "index", "icon"],
      properties: {
        uid: { type: "string" }, id: { type: "string" }, locale: { type: "string" }, index: { type: "integer", minimum: 0 },
        icon: { type: "string" },
        items: { type: "array", items: { type: "integer", minimum: 0 }, maxItems: 50 },
      },
    },
    async run(ctx, args) {
      assertContentTypeAllowed(ctx, args.uid);
      assertPageUid(args.uid);
      const e: any = await cmsOf(ctx).get(args.uid, args.id, { locale: args.locale });
      if (!e) throw new CmsError("Page not found", 404);
      const current = toBuilder((e[blocksField(args.uid, args.locale)] ?? []) as any[], dialectOf(ctx));
      if (args.index < 0 || args.index >= current.length) throw new CmsError(`No block at index ${args.index} (page has ${current.length}).`, 400);
      const block = current[args.index];
      const meta = metaOf(block.__component);
      const itemsKey = meta?.items?.key;
      const iconField = meta?.items?.fields?.find((f: any) => f.icon)?.k;
      const list: any[] = itemsKey && Array.isArray(block[itemsKey]) ? block[itemsKey] : [];
      if (!itemsKey || !iconField) throw new CmsError(`Block type "${block.__component}" has no items with an icon to change.`, 400);
      if (!list.length) throw new CmsError(`Block ${args.index} has no items.`, 400);
      const which: number[] = Array.isArray(args.items) ? [...new Set<number>(args.items)] : list.map((_, i) => i);
      const bad = which.find((i) => i < 0 || i >= list.length);
      if (bad !== undefined) throw new CmsError(`Block ${args.index} has ${list.length} item(s); there is no item ${bad}.`, 400);
      if (!which.length) throw new CmsError("`items` is empty — leave it out to change every item.", 400);

      const value = await resolveIconValue(ctx, String(args.icon));
      const updated = { ...block, [itemsKey]: list.map((it, i) => (which.includes(i) ? { ...it, [iconField]: value } : it)) };
      assertSafeBlockContent(updated);
      const what = `${which.length} icon(s) to ${args.icon}`;
      if (shouldPropose(ctx, args)) {
        return {
          summary: `Proposed setting ${what}`,
          proposal: { id: randomUUID(), kind: "blocks", target: { uid: args.uid, id: args.id, locale: args.locale }, title: `Set ${what}`, blocks: [updated], replace: args.index },
        };
      }
      const next = current.map((b: any, i: number) => (i === args.index ? updated : b));
      await snapshotPageVersion(ctx, args.uid, args.id, titleOf(e), current, blocksField(args.uid, args.locale));
      await cmsOf(ctx).update(args.uid, args.id, { [blocksField(args.uid, args.locale)]: toWire(next, dialectOf(ctx)) }, { locale: args.locale });
      return { summary: `Set ${what} on block ${args.index}`, data: { uid: args.uid, id: args.id } };
    },
  },
  {
    name: "import_wordpress_page",
    mode: "read",
    description: `Fetch one page's title, content, and featured image from a WordPress site's public REST API — either an external WordPress site, or one of this app's own WordPress-engine tenants (their content is public the same way). Reads a page built in WordPress's own editor AND one built in this app's Visual Builder (whose content lives in a custom field, not WordPress's native content). Does NOT create anything by itself: use the returned content afterward with create_draft_entry then insert_blocks — the same two-step flow used to build any other page from scratch. ${IMPORT_SHAPE_HINT} \`siteUrl\` is the site's WordPress REST API base (e.g. "http://localhost:8081/wp-json" or "https://example.gov/wp-json"), NOT the page's own permalink; \`slug\` is the page's own slug (the part after the domain on its real URL, e.g. "about-us").`,
    parameters: {
      type: "object", additionalProperties: false, required: ["siteUrl", "slug"],
      properties: { siteUrl: { type: "string" }, slug: { type: "string" } },
    },
    async run(_ctx, args) {
      const c = await fetchWordpressPage(args.siteUrl, args.slug);
      return { summary: `Fetched "${c.title}" from ${args.siteUrl}`, data: c };
    },
  },
  {
    name: "import_url_page",
    mode: "read",
    description: `Fetch an ordinary webpage (any link, not necessarily WordPress) and extract its title, content, and a representative image if one exists. Best-effort, not a full render — works well on reasonably well-structured pages (blogs, docs, articles), poorly on JS-heavy ones. Does NOT create anything by itself: use the returned content afterward with create_draft_entry then insert_blocks, the same two-step flow used to build any other page from scratch. ${IMPORT_SHAPE_HINT}`,
    parameters: {
      type: "object", additionalProperties: false, required: ["url"],
      properties: { url: { type: "string" } },
    },
    async run(_ctx, args) {
      const c = await fetchUrlPageContent(args.url);
      return { summary: `Fetched "${c.title}" from ${args.url}`, data: c };
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
