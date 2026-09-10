// Shared types for the WebX Agent runtime — kept dependency-light (no
// governance.ts import cycle: runtime.ts imports FROM governance.ts, so
// governance.ts's own exported AgentLevel/AgentPolicy types are re-exported
// here rather than this file importing them back, keeping the direction of
// the dependency graph obvious at a glance).
import type { CurrentUser } from "@/lib/cms/types";

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
 * would diverge from or clobber it. Page-building tool kinds ("page") are
 * accepted here now but their tools land in a follow-up pass — see
 * tools.ts's own header comment. */
export type AgentContextRef =
  | { kind: "page"; uid: string; docId: string; locale?: string; applyLocally?: boolean }
  | { kind: "entry"; uid: string; docId: string; locale?: string; applyLocally?: boolean }
  | { kind: "board" }
  | { kind: "none" };

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
};

// ---- SSE wire events (app/api/agent/run/route.ts emits these; the client's
// useAgentRun hook — Milestone 2 — parses the identical shape) ----
export type AgentEvent =
  | { type: "run_started"; runId: string; threadId: string; level: AgentLevel; model: string }
  | { type: "thinking"; turn: number }
  | { type: "tool_call"; id: string; name: string; args: Record<string, any> }
  | { type: "tool_result"; id: string; ok: boolean; summary: string; data?: any }
  | { type: "text"; content: string }
  | { type: "proposal"; proposal: AgentProposal }
  | { type: "usage"; promptTokens: number; completionTokens: number }
  | { type: "done"; runId: string; applied?: { uid: string; id: string }[] }
  | { type: "error"; code: string; message: string };

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
