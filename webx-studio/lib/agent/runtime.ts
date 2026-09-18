// Interactive runs (docked panel and /agent workspace). Policy and plan-cap
// checks happen in the API route before this is called; the loop itself
// lives in ./engine so background jobs can run the same code in slices.
import "server-only";
import { recordAgentRunStart, recordAgentRunUsage, type AgentPolicy } from "@/lib/cms/governance";
import { applyInput, startRun } from "./engine/checkpoint";
import { serverDeps } from "./engine/deps.server";
import { limitsFor } from "./engine/limits";
import { runSlice } from "./engine/loop";
import type { RunCheckpoint, StopReason } from "./engine/types";
import type { AgentContextRef, AgentEvent, AgentProposal, AgentRunContext, PlanItem } from "./types";

const DEFAULT_MODEL = process.env.LITELLM_MODEL || "webx-default";

// The user turn added when Continue is pressed without a message. Always
// adding a user turn on resume also means reasoning stripped from a saved
// checkpoint is never needed on resend: providers only require it echoed
// within the current turn.
const CONTINUE_PROMPT = { en: "Continue from where you stopped.", th: "ทำต่อจากจุดที่หยุดไว้" } as const;

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type RunInput = {
  user: { id: any; email?: string; roles: string[]; isSuperAdmin: boolean };
  policy: AgentPolicy;
  runId: string;
  threadId: string;
  mode: "docked" | "workspace";
  lang: "en" | "th";
  ref: AgentContextRef;
  /** Plain text turns from the thread; tool calls are never replayed across separate runs. */
  priorText: ChatMsg[];
  /** Empty only when continuing a stopped run. */
  message: string;
  /** A human-pasted image attached alongside `message`, for the model to look at. */
  image?: { dataUrl: string; mimeType: string };
  /** The thread's saved checkpoint. When set, the run continues it instead of starting over. */
  resume?: RunCheckpoint | null;
  signal?: AbortSignal;
};

export type RunResult = {
  finalText: string;
  toolSteps: { name: string; ok: boolean; summary: string }[];
  proposals: AgentProposal[];
  /** Entries actually written through governed.* this run (never proposals). */
  applied: { uid: string; id: string }[];
  usage: { promptTokens: number; completionTokens: number };
  aborted: boolean;
  stopReason: StopReason;
  stopMessage: string;
  /** Set when the work can be picked up again: a resumable stop, or a run the user stopped. */
  checkpoint: RunCheckpoint | null;
  /** The run's checklist as it stands, if the model made one. */
  plan: PlanItem[] | null;
  /** Set when the run stopped to wait for the user's answer. */
  question: { question: string; options: string[] } | null;
};

export async function runAgent(input: RunInput, emit: (e: AgentEvent) => void): Promise<RunResult> {
  const model = input.policy.model || DEFAULT_MODEL;
  const text = input.message.trim();

  let cp: RunCheckpoint;
  if (input.resume) {
    const base = applyInput(input.resume, { kind: "message", text: text || CONTINUE_PROMPT[input.lang], image: input.image?.dataUrl });
    // The current request decides the model, the surface and which editor is open.
    cp = { ...base, runId: input.runId, threadId: input.threadId, model, mode: input.mode, lang: input.lang, ref: input.ref };
  } else {
    cp = startRun({
      runId: input.runId, threadId: input.threadId, mode: input.mode, lang: input.lang, ref: input.ref, model,
      priorText: input.priorText, message: input.message, image: input.image?.dataUrl,
    });
  }
  // A new message is a new metered run; pressing Continue is not.
  if (text || input.image) recordAgentRunStart(input.user as any, input.runId).catch(() => {});

  const ctx: AgentRunContext = {
    user: input.user as any, tenantKey: input.policy.tenantKey, level: input.policy.level,
    allowedTools: input.policy.tools, allowedContentTypes: input.policy.contentTypes,
    model: input.policy.model, runId: cp.runId, threadId: input.threadId, lang: input.lang,
    ref: cp.ref, signal: input.signal, dialect: input.policy.dialect, engine: input.policy.engine,
  };

  emit({ type: "run_started", runId: cp.runId, threadId: input.threadId, level: ctx.level, model });

  const before = { prompt: cp.counters.promptTokens, completion: cp.counters.completionTokens };
  const r = await runSlice(cp, serverDeps(ctx, emit), limitsFor(input.mode), input.signal);
  const counters = r.checkpoint.counters;
  if (counters.promptTokens + counters.completionTokens > 0) {
    emit({ type: "usage", promptTokens: counters.promptTokens, completionTokens: counters.completionTokens });
  }
  const usage = { promptTokens: counters.promptTokens - before.prompt, completionTokens: counters.completionTokens - before.completion };
  // Completion-time counterpart to recordAgentRunStart above — that call
  // only counts this as a metered run, since actual usage isn't known until
  // now. This is what lets enforceAgentTokenBudget see chat-run tokens at
  // all (previously only background jobs' own tokensUsed were counted).
  recordAgentRunUsage(input.user as any, input.runId, usage.promptTokens + usage.completionTokens).catch(() => {});

  return {
    finalText: r.finalText,
    toolSteps: r.steps,
    proposals: r.proposals,
    applied: r.applied,
    usage,
    aborted: r.stop === "aborted",
    stopReason: r.stop,
    stopMessage: r.stopMessage,
    // A stopped run (Stop, a closed tab, a page reload) keeps its checkpoint too:
    // it offers no Continue button, but the next message carries on from it
    // instead of starting over (found live: a reload lost 16 steps of work).
    checkpoint: r.resumable || r.stop === "aborted" ? r.checkpoint : null,
    plan: r.checkpoint.plan?.items ?? null,
    question: r.stop === "waiting_input" && r.checkpoint.waiting
      ? { question: r.checkpoint.waiting.question, options: r.checkpoint.waiting.options }
      : null,
  };
}
