// Types for the WebX Agent engine. The engine is loaded directly by
// `node --test`, so nothing under lib/agent/engine/ (except deps.server.ts)
// may import `server-only`, Next, or the CMS adapters.
import type { AgentContextRef, AgentEvent, AgentProposal } from "../types";

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: Record<string, any> } };
export type TextBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

/** One message as sent to an OpenAI-compatible /chat/completions endpoint. */
export type WireMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | TextBlock[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
  thinking_blocks?: unknown[];
};

export type ChatRequest = {
  messages: WireMsg[];
  tools?: ToolSpec[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export type ChatReply = {
  message: { content: string | null; tool_calls?: ToolCall[]; reasoning_content?: string; thinking_blocks?: unknown[] };
  usage?: { prompt_tokens: number; completion_tokens: number };
  finishReason?: string;
  model?: string;
};

export type ChatFn = (req: ChatRequest) => Promise<ChatReply>;

export type ToolOutcome = { ok: boolean; summary: string; data?: any; proposal?: AgentProposal };

export type ReasoningPayload = { content?: string; thinkingBlocks?: unknown[]; servedBy: string };

export type ToolResultRec = {
  callId: string;
  name: string;
  ok: boolean;
  summary: string;
  /** What the model sees while this exchange is recent (valid JSON, size-capped). */
  full: string;
  /** What the model sees once the exchange is old (valid JSON, ~300 bytes, ids kept). */
  digest: string;
  executed: boolean;
};

export type HItem =
  | { kind: "user"; text: string }
  | { kind: "assistant_text"; text: string; reasoning?: ReasoningPayload }
  | { kind: "exchange"; text: string | null; reasoning?: ReasoningPayload; calls: ToolCall[]; results: ToolResultRec[] };

export type ExchangeItem = Extract<HItem, { kind: "exchange" }>;

export type StopReason =
  | "slice_end" | "retry_later" | "waiting_input" | "paused" | "budget"
  | "done" | "done_incomplete" | "text" | "stuck" | "cancelled" | "aborted" | "policy" | "llm_error" | "internal_error";

export const RESUMABLE_STOPS: ReadonlySet<StopReason> = new Set<StopReason>(["slice_end", "retry_later", "waiting_input", "paused", "budget"]);

export type RunMode = "docked" | "workspace" | "job";

export type ToolStepRec = { name: string; ok: boolean; summary: string };
export type AppliedRef = { uid: string; id: string };

export type RunCheckpoint = {
  v: 1;
  runId: string;
  threadId: string;
  jobId?: string;
  mode: RunMode;
  lang: "en" | "th";
  ref: AgentContextRef;
  /** The model alias requested from LiteLLM (e.g. "webx-kimi"). */
  model: string;
  history: HItem[];
  pinned?: { goal?: string; progress?: string };
  ledger: { applied: AppliedRef[]; proposals: AgentProposal[]; toolSteps: ToolStepRec[] };
  counters: { turns: number; toolCalls: number; promptTokens: number; completionTokens: number; protocolRepairs: number; ms: number };
  /** Set while a tool batch is running; `pendingWrite` marks a write that started but has no recorded result. */
  inflight?: { exchangeIndex: number; done: string[]; pendingWrite?: string };
  lastStop?: StopReason;
};

export type EngineTools = {
  specs(): ToolSpec[];
  isWrite(name: string): boolean;
  execute(call: ToolCall): Promise<ToolOutcome>;
};

export type EngineClock = { now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void> };

export type SaveAt = "turn" | "pre_write" | "stop";

export type EngineDeps = {
  chat: ChatFn;
  tools: EngineTools;
  clock: EngineClock;
  emit: (e: AgentEvent) => void;
  systemPrompt: () => string;
  save?: (cp: RunCheckpoint, at: SaveAt) => Promise<void>;
  control?: () => Promise<"run" | "pause" | "cancel">;
  /** Throw on a protocol violation instead of repairing it (tests). */
  strictProtocol?: boolean;
};

export type SliceLimits = {
  maxTurns: number;
  /** No new turn starts once this much wall time has passed in the slice. */
  maxWallMs: number;
  llmTimeoutMs: number;
  maxToolCallsPerTurn: number;
  maxTokens: number;
  toolFullBytes: number;
  toolDigestBytes: number;
  /** Past this much tool content in history, exchanges older than the last two are sent as digests. */
  digestAfterBytes: number;
};

export type SliceResult = {
  checkpoint: RunCheckpoint;
  stop: StopReason;
  finalText: string;
  stopMessage: string;
  steps: ToolStepRec[];
  proposals: AgentProposal[];
  applied: AppliedRef[];
};
