import { buildWireMessages } from "./checkpoint";
import { checkProtocol, ProtocolError, repairHistory } from "./invariants";
import { sameReasoningTarget } from "./providers";
import { toolResultRecord } from "./toolView";
import {
  RESUMABLE_STOPS,
  type AppliedRef, type ChatReply, type EngineDeps, type ExchangeItem, type ReasoningPayload, type RunCheckpoint,
  type SliceLimits, type SliceResult, type StopReason, type ToolCall, type ToolOutcome, type ToolStepRec,
} from "./types";
import type { AgentProposal } from "../types";

export const OUTCOME_UNKNOWN =
  "Outcome unknown: the run stopped after this call started but before its result was recorded. Verify with a read tool (search_content or get_entry) before retrying it.";

const NOT_EXECUTED_STOPPED = "Not executed: the run was stopped before this call started.";
const MAX_LEDGER_STEPS = 500;

const notExecutedOverLimit = (limit: number) =>
  `Not executed: at most ${limit} tool calls run per turn. Re-issue this call next turn if it is still needed.`;

type SliceOut = { steps: ToolStepRec[]; proposals: AgentProposal[]; applied: AppliedRef[] };

function linkSignals(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const live = signals.filter((s): s is AbortSignal => Boolean(s));
  if (live.length <= 1) return live[0];
  const ac = new AbortController();
  for (const s of live) {
    if (s.aborted) {
      ac.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => ac.abort(s.reason), { once: true });
  }
  return ac.signal;
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(Math.max(1, ms)) : undefined;
}

function safeArgs(raw: string): Record<string, any> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function existingCallIds(cp: RunCheckpoint): Set<string> {
  const ids = new Set<string>();
  for (const h of cp.history) if (h.kind === "exchange") for (const c of h.calls) ids.add(c.id);
  return ids;
}

function normalizeCalls(raw: unknown, turn: number, taken: Set<string>): ToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: any, i: number) => {
    let id = typeof c?.id === "string" && c.id ? c.id : `call_t${turn}_${i}`;
    if (taken.has(id)) id = `${id}_t${turn}_${i}`;
    taken.add(id);
    const args = c?.function?.arguments;
    return {
      id,
      type: "function" as const,
      function: {
        name: typeof c?.function?.name === "string" ? c.function.name : "",
        arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
      },
    };
  });
}

function reasoningOf(reply: ChatReply, requested: string): ReasoningPayload | undefined {
  const content = typeof reply.message.reasoning_content === "string" && reply.message.reasoning_content ? reply.message.reasoning_content : undefined;
  const blocks = Array.isArray(reply.message.thinking_blocks) && reply.message.thinking_blocks.length ? reply.message.thinking_blocks : undefined;
  if (!content && !blocks) return undefined;
  // LiteLLM usually reports the alias we asked for; a different model family means a router fallback.
  const servedBy = reply.model && !sameReasoningTarget(reply.model, requested) ? reply.model : requested;
  return { ...(content ? { content } : {}), ...(blocks ? { thinkingBlocks: blocks } : {}), servedBy };
}

function stopMessageFor(stop: StopReason, lang: "en" | "th", steps: ToolStepRec[]): string {
  const ok = steps.filter((s) => s.ok).length;
  if (stop === "paused") return lang === "th" ? "หยุดชั่วคราวแล้ว" : "Paused.";
  if (stop === "slice_end") {
    return lang === "th"
      ? `หยุดชั่วคราว — ครบขีดจำกัดของรอบนี้ (สำเร็จ ${ok} จาก ${steps.length} ขั้นตอน) กด "ทำต่อ" เพื่อทำงานต่อจากจุดเดิม`
      : `Paused — reached this run's step limit (${ok} of ${steps.length} steps succeeded). Continue to pick up where it left off.`;
  }
  return lang === "th" ? "หยุดชั่วคราว" : "Paused.";
}

async function runBatch(cp: RunCheckpoint, deps: EngineDeps, limits: SliceLimits, signal: AbortSignal | undefined, slice: SliceOut): Promise<"ok" | "aborted"> {
  const inflight = cp.inflight!;
  const ex = cp.history[inflight.exchangeIndex] as ExchangeItem;
  let aborted = false;

  for (let i = 0; i < ex.calls.length; i++) {
    const call = ex.calls[i];
    if (ex.results.some((r) => r.callId === call.id)) continue;
    const name = call.function.name;

    if (i >= limits.maxToolCallsPerTurn) {
      ex.results.push(toolResultRecord(call.id, name, { ok: false, summary: notExecutedOverLimit(limits.maxToolCallsPerTurn) }, false, limits));
      continue;
    }
    if (inflight.pendingWrite === call.id) {
      ex.results.push(toolResultRecord(call.id, name, { ok: false, summary: OUTCOME_UNKNOWN }, false, limits));
      inflight.pendingWrite = undefined;
      inflight.done.push(call.id);
      continue;
    }
    if (aborted || signal?.aborted) {
      aborted = true;
      ex.results.push(toolResultRecord(call.id, name, { ok: false, summary: NOT_EXECUTED_STOPPED }, false, limits));
      continue;
    }

    deps.emit({ type: "tool_call", id: call.id, name, args: safeArgs(call.function.arguments) });
    if (deps.tools.isWrite(name)) {
      inflight.pendingWrite = call.id;
      if (deps.save) await deps.save(cp, "pre_write");
    }

    let out: ToolOutcome;
    try {
      out = await deps.tools.execute(call);
    } catch {
      out = { ok: false, summary: "Tool failed unexpectedly." };
    }

    cp.counters.toolCalls++;
    ex.results.push(toolResultRecord(call.id, name, out, true, limits));
    const step: ToolStepRec = { name, ok: out.ok, summary: out.summary };
    cp.ledger.toolSteps.push(step);
    if (cp.ledger.toolSteps.length > MAX_LEDGER_STEPS) cp.ledger.toolSteps.splice(0, cp.ledger.toolSteps.length - MAX_LEDGER_STEPS);
    slice.steps.push(step);
    if (out.proposal) {
      cp.ledger.proposals.push(out.proposal);
      slice.proposals.push(out.proposal);
    } else if (out.ok && out.data?.uid && out.data?.id) {
      const ref = { uid: String(out.data.uid), id: String(out.data.id) };
      cp.ledger.applied.push(ref);
      slice.applied.push(ref);
    }
    deps.emit({ type: "tool_result", id: call.id, ok: out.ok, summary: out.summary, data: out.proposal ? undefined : out.data });
    if (out.proposal) deps.emit({ type: "proposal", proposal: out.proposal });

    inflight.pendingWrite = undefined;
    inflight.done.push(call.id);
  }

  cp.inflight = undefined;
  if (deps.save) await deps.save(cp, "turn");
  return aborted ? "aborted" : "ok";
}

/** Runs one bounded slice of a conversation and returns the updated checkpoint. Never mutates `input`. */
export async function runSlice(input: RunCheckpoint, deps: EngineDeps, limits: SliceLimits, signal?: AbortSignal): Promise<SliceResult> {
  const cp: RunCheckpoint = structuredClone(input);
  const t0 = deps.clock.now();
  const slice: SliceOut = { steps: [], proposals: [], applied: [] };
  let sliceTurns = 0;

  const finish = async (stop: StopReason, finalText = ""): Promise<SliceResult> => {
    cp.lastStop = stop;
    cp.counters.ms += Math.max(0, deps.clock.now() - t0);
    let stopMessage = "";
    if (RESUMABLE_STOPS.has(stop)) {
      stopMessage = stopMessageFor(stop, cp.lang, slice.steps);
      deps.emit({ type: "stopped", reason: stop, resumable: true, message: stopMessage });
    }
    if (deps.save) await deps.save(cp, "stop");
    return { checkpoint: cp, stop, finalText, stopMessage, ...slice };
  };

  if (cp.inflight && (await runBatch(cp, deps, limits, signal, slice)) === "aborted") return finish("aborted");

  for (;;) {
    if (signal?.aborted) return finish("aborted");
    if (deps.control) {
      const c = await deps.control();
      if (c === "cancel") return finish("cancelled");
      if (c === "pause") return finish("paused");
    }
    const elapsed = deps.clock.now() - t0;
    if (sliceTurns >= limits.maxTurns || elapsed >= limits.maxWallMs) return finish("slice_end");

    const specs = deps.tools.specs();
    if (!specs.length && cp.history.some((h) => h.kind === "exchange")) return finish("policy");

    deps.emit({ type: "thinking", turn: cp.counters.turns + 1 });
    let messages = buildWireMessages(cp, { system: deps.systemPrompt(), targetModel: cp.model, digestAfterBytes: limits.digestAfterBytes });
    const errors = checkProtocol(messages, { toolsSent: specs.length > 0 }).filter((v) => v.severity === "error");
    if (errors.length) {
      if (deps.strictProtocol) throw new ProtocolError(errors);
      const fixed = repairHistory(messages);
      messages = fixed.messages;
      cp.counters.protocolRepairs += fixed.repairs;
    }

    let reply: ChatReply;
    try {
      const timeoutMs = Math.min(limits.llmTimeoutMs, Math.max(0, limits.maxWallMs - elapsed) + 30_000);
      reply = await deps.chat({
        messages,
        tools: specs.length ? specs : undefined,
        model: cp.model || undefined,
        maxTokens: limits.maxTokens,
        signal: linkSignals(signal, timeoutSignal(timeoutMs)),
      });
    } catch {
      if (signal?.aborted) return finish("aborted");
      deps.emit({ type: "error", code: "llm", message: cp.lang === "th" ? "เรียก AI ไม่สำเร็จ" : "The AI request failed." });
      return finish("llm_error");
    }

    sliceTurns++;
    cp.counters.turns++;
    if (reply.usage) {
      cp.counters.promptTokens += Number(reply.usage.prompt_tokens) || 0;
      cp.counters.completionTokens += Number(reply.usage.completion_tokens) || 0;
    }

    const reasoning = reasoningOf(reply, cp.model);
    const calls = normalizeCalls(reply.message.tool_calls, cp.counters.turns, existingCallIds(cp));
    const text = typeof reply.message.content === "string" ? reply.message.content : "";

    if (!calls.length) {
      if (text.trim()) cp.history.push({ kind: "assistant_text", text, ...(reasoning ? { reasoning } : {}) });
      deps.emit({ type: "text", content: text });
      return finish("text", text);
    }

    cp.history.push({ kind: "exchange", text: text || null, ...(reasoning ? { reasoning } : {}), calls, results: [] });
    cp.inflight = { exchangeIndex: cp.history.length - 1, done: [] };
    if (deps.save) await deps.save(cp, "turn");
    if ((await runBatch(cp, deps, limits, signal, slice)) === "aborted") return finish("aborted");
  }
}
