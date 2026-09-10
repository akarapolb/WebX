// The agent's own tool-calling loop. Policy/budget checks (level, plan cap)
// happen in the API route BEFORE this is called — proper HTTP status codes
// for those, not an SSE stream that opens just to emit one error event — so
// everything here assumes it's already allowed to run and focuses purely on
// the conversation loop, tool execution, and what to persist afterward.
import "server-only";
import { randomUUID } from "node:crypto";
import { chat, type Msg } from "@/lib/llm";
import { withAgentActor, recordAgentRunStart, type AgentPolicy } from "@/lib/cms/governance";
import { systemPrompt } from "./prompts";
import { availableTools, toolSpecs, executeTool } from "./tools";
import type { AgentContextRef, AgentEvent, AgentRunContext } from "./types";

const MAX_TURNS = 12;
const MAX_TOOL_CALLS_PER_TURN = 6;
const BUDGET_MS_BY_MODE: Record<"docked" | "workspace", number> = { docked: 90_000, workspace: 600_000 };

function combined(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const ac = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) { ac.abort(); break; }
    s.addEventListener("abort", () => ac.abort(), { once: true });
  }
  return ac.signal;
}

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type RunInput = {
  user: { id: any; email?: string; roles: string[]; isSuperAdmin: boolean };
  policy: AgentPolicy;
  runId: string;
  threadId: string;
  mode: "docked" | "workspace";
  lang: "en" | "th";
  ref: AgentContextRef;
  /** Plain conversational turns only (no raw tool-call replay across runs —
   * see this module's own design note in the Phase 8 plan: the persisted
   * thread mirrors exactly the UI's own renderable message list, and a new
   * run's LLM context is reconstructed from just the text turns, not a
   * verbatim tool_calls replay, which is the fragile part of OpenAI-shaped
   * history across models/providers). */
  priorText: ChatMsg[];
  message: string;
  signal?: AbortSignal;
};

export type RunResult = {
  finalText: string;
  toolSteps: { name: string; ok: boolean; summary: string }[];
  proposals: import("./types").AgentProposal[];
  /** Entries actually written through governed.* this run (never proposals)
   * — the client's done.applied signal, telling an open editor whose
   * content just changed underneath it that it should offer to reload. */
  applied: { uid: string; id: string }[];
  usage: { promptTokens: number; completionTokens: number };
  aborted: boolean;
};

export async function runAgent(input: RunInput, emit: (e: AgentEvent) => void): Promise<RunResult> {
  const ctx: AgentRunContext = {
    user: input.user as any, tenantKey: input.policy.tenantKey, level: input.policy.level,
    allowedTools: input.policy.tools, allowedContentTypes: input.policy.contentTypes,
    model: input.policy.model, runId: input.runId, threadId: input.threadId, lang: input.lang,
    ref: input.ref, signal: input.signal, dialect: input.policy.dialect, engine: input.policy.engine,
  };

  emit({ type: "run_started", runId: input.runId, threadId: input.threadId, level: ctx.level, model: ctx.model || "default" });
  recordAgentRunStart(input.user as any, input.runId).catch(() => {});

  const messages: Msg[] = [
    { role: "system", content: [{ type: "text", text: systemPrompt(ctx), cache_control: { type: "ephemeral" } }] },
    ...input.priorText.map((m): Msg => ({ role: m.role, content: m.content })),
    { role: "user", content: input.message },
  ];

  const specs = toolSpecs(ctx);
  const deadline = Date.now() + BUDGET_MS_BY_MODE[input.mode];
  const usage = { promptTokens: 0, completionTokens: 0 };
  const toolSteps: RunResult["toolSteps"] = [];
  const proposals: RunResult["proposals"] = [];
  const applied: RunResult["applied"] = [];
  let finalText = "";
  let aborted = false;

  turnLoop: for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (input.signal?.aborted) { aborted = true; break; }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      emit({ type: "error", code: "budget", message: input.lang === "th" ? "เกินเวลาที่กำหนดสำหรับการทำงานนี้" : "This run took too long and was stopped." });
      break;
    }
    emit({ type: "thinking", turn: turn + 1 });

    let result: Awaited<ReturnType<typeof chat>>;
    try {
      result = await chat({
        messages, tools: specs.length ? specs : undefined, model: ctx.model || undefined,
        signal: combined(input.signal, AbortSignal.timeout(Math.min(remaining, 60_000))),
      });
    } catch (e: any) {
      if (e?.name === "AbortError" || input.signal?.aborted) { aborted = true; break turnLoop; }
      emit({ type: "error", code: "llm", message: input.lang === "th" ? "เรียก AI ไม่สำเร็จ" : "The AI request failed." });
      break turnLoop;
    }
    if (result.usage) { usage.promptTokens += result.usage.prompt_tokens; usage.completionTokens += result.usage.completion_tokens; }

    const calls = (result.message.tool_calls || []).slice(0, MAX_TOOL_CALLS_PER_TURN);
    if (!calls.length) {
      finalText = result.message.content || "";
      messages.push({ role: "assistant", content: finalText });
      emit({ type: "text", content: finalText });
      break;
    }

    messages.push({ role: "assistant", content: result.message.content ?? null, tool_calls: result.message.tool_calls });
    for (const call of calls) {
      const args = safeArgsPreview(call.function.arguments);
      emit({ type: "tool_call", id: call.id, name: call.function.name, args });
      const r = await withAgentActor(input.runId, () => executeTool(ctx, call.function.name, call.function.arguments));
      toolSteps.push({ name: call.function.name, ok: r.ok, summary: r.summary });
      if (r.proposal) proposals.push(r.proposal);
      else if (r.ok && r.data?.uid && r.data?.id) applied.push({ uid: r.data.uid, id: r.data.id });
      emit({ type: "tool_result", id: call.id, ok: r.ok, summary: r.summary, data: r.proposal ? undefined : r.data });
      if (r.proposal) emit({ type: "proposal", proposal: r.proposal });
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify({ ok: r.ok, summary: r.summary, proposal: r.proposal ? { id: r.proposal.id, kind: r.proposal.kind } : undefined }) });
    }
  }

  if (usage.promptTokens + usage.completionTokens > 0) emit({ type: "usage", promptTokens: usage.promptTokens, completionTokens: usage.completionTokens });
  return { finalText, toolSteps, proposals, applied, usage, aborted };
}

function safeArgsPreview(raw: string): Record<string, any> {
  try { return JSON.parse(raw); } catch { return {}; }
}
