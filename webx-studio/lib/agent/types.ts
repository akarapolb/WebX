// Shared types for the WebX Agent runtime — kept dependency-light (no
// governance.ts import cycle: runtime.ts imports FROM governance.ts, so
// governance.ts's own exported AgentLevel/AgentPolicy types are re-exported
// here rather than this file importing them back, keeping the direction of
// the dependency graph obvious at a glance).
import type { CurrentUser, EntryList, EntryQuery } from "@/lib/cms/types";
import type { ContentTypeSchema } from "./schemaDigest";

export type AgentLevel = "off" | "read" | "suggest" | "draft" | "draft_submit";
// Mirrors governance.ts's own private AGENT_LEVEL_RANK — duplicated rather
// than imported so this file has no reverse dependency on governance.ts (see
// header comment); the ordering is part of AgentLevel's own contract and as
// stable as the type itself.
const LEVEL_RANK: Record<AgentLevel, number> = { off: 0, read: 1, suggest: 2, draft: 3, draft_submit: 4 };
export const levelAtLeast = (have: AgentLevel, need: AgentLevel): boolean => LEVEL_RANK[have] >= LEVEL_RANK[need];

/** What the run is "about" — set by the client from whichever editor (if
 * any) is open. `applyLocally: true` is the signal the tool executor uses to
 * downgrade a draft-mode write into a `proposal` event instead of writing
 * through governed.* directly (see tools.ts) — the Visual Builder and
 * EntryEditor hold their own unsaved local state, so a server-side write
 * would diverge from or clobber it. */
export type AgentContextRef =
  | { kind: "page"; uid: string; docId: string; locale?: string; applyLocally?: boolean }
  | { kind: "entry"; uid: string; docId: string; locale?: string; applyLocally?: boolean }
  | { kind: "board" }
  | { kind: "none" };

/** The CMS operations the agent's tools use. Production passes governed.*,
 * so every tenant, role and field-policy guard applies; tests pass an
 * in-memory stand-in (tests/harness/fakeCms.ts). */
export type AgentCms = {
  list<T = any>(uid: string, query?: EntryQuery): Promise<EntryList<T>>;
  get<T = any>(uid: string, id: string, opts?: { locale?: string }): Promise<T | null>;
  create<T = any>(uid: string, data: Record<string, any>): Promise<T>;
  update<T = any>(uid: string, id: string, data: Record<string, any>, opts?: { locale?: string }): Promise<T>;
  listContentTypes(tenantKey: string): Promise<{ uid: string; label: string }[]>;
  contentTypeSchema(uid: string): Promise<ContentTypeSchema | null>;
};

export type AgentRunContext = {
  user: CurrentUser;
  tenantKey: string | null;
  level: AgentLevel;
  allowedTools: string[] | null;
  allowedContentTypes: string[] | null;
  model: string;
  runId: string;
  threadId: string;
  lang: "en" | "th";
  ref: AgentContextRef;
  signal?: AbortSignal;
  /** The tenant's own publicTemplate ("gov-portal"|"orst"|"royalsociety",
   * governance.ts's AgentPolicy.dialect) and content engine — the
   * page-building tools (tools.ts) need both: dialect to translate a
   * page's stored blocks through blockDialect.ts's toBuilder/toWire, engine
   * to pick "wp:page" vs the Strapi page/landing uids. */
  dialect: string;
  engine: "strapi" | "wordpress";
  /** Defaults to governed.* (see tools.ts). */
  cms?: AgentCms;
};

// ---- SSE wire events (app/api/agent/run/route.ts emits these; the client's
// useAgentRun hook parses the identical shape) ----
export type AgentEvent =
  | { type: "run_started"; runId: string; threadId: string; level: AgentLevel; model: string }
  | { type: "thinking"; turn: number }
  | { type: "tool_call"; id: string; name: string; args: Record<string, any> }
  | { type: "tool_result"; id: string; ok: boolean; summary: string; data?: any }
  | { type: "text"; content: string }
  | { type: "proposal"; proposal: AgentProposal }
  | { type: "usage"; promptTokens: number; completionTokens: number }
  | { type: "done"; runId: string; applied?: { uid: string; id: string }[] }
  | { type: "error"; code: string; message: string }
  /** The run ended before finishing its task. A `resumable` run can be continued from the thread's saved checkpoint. */
  | { type: "stopped"; reason: string; resumable: boolean; message: string }
  /** A model request is being retried (after a transient failure, or a truncated or empty reply). */
  | { type: "retry"; attempt: number; delayMs: number; reason: string }
  /** Older history was summarized to stay inside the model's context window. */
  | { type: "compaction"; beforeTokens: number; afterTokens: number; folded: number }
  /** The model wrote or replaced its plan. */
  | { type: "plan"; items: PlanItem[] }
  | { type: "plan_item"; id: string; status: PlanStatus; note?: string; result?: string }
  /** The model is waiting for the user to answer. */
  | { type: "question"; question: string; options?: string[] }
  /** The plan was checked before the run finished. */
  | { type: "verification"; ok: boolean; report: string };

export type PlanStatus = "pending" | "in_progress" | "done" | "blocked" | "skipped";
export type PlanItem = { id: string; title: string; detail?: string; status: PlanStatus; note?: string; result?: string };
/** A run's checklist (engine/harnessTools.ts). A `locked` plan comes from a job template and can't be replaced. */
export type RunPlan = { items: PlanItem[]; locked?: boolean; nudges: number };

export type AgentProposal = {
  id: string;
  kind: "fields" | "blocks" | "table";
  target: { uid: string; id: string; locale?: string };
  title: string;
  summary?: string;
  fields?: Record<string, any>;
  blocks?: any[];
  at?: number;
  replace?: number;
};

/** One tool's contract — `mode` gates it against the resolved AgentLevel
 * (read <= "read", the rest need at least "suggest"/"draft"/"draft_submit" —
 * see tools.ts's MODE_MIN_LEVEL) and, separately, whether it may run at all
 * when applyLocally downgrades a write to a proposal. */
export type ToolMode = "read" | "draft" | "submit";
export type ToolDef = {
  name: string;
  mode: ToolMode;
  description: string;
  parameters: Record<string, any>;
  run(ctx: AgentRunContext, args: Record<string, any>): Promise<{ summary: string; data?: any; proposal?: AgentProposal }>;
};
