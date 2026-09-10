import { buildWireMessages, emptyCounters } from "./checkpoint";
import { calibrateRatio, compactHistory, DEFAULT_TOKEN_RATIO, type CompactionResult } from "./compaction";
import { harnessSpecs, isHarnessTool, runHarnessTool } from "./harnessTools";
import { checkProtocol, ProtocolError, repairHistory } from "./invariants";
import { sameReasoningTarget } from "./providers";
import { decideRetry, type RetryState } from "./retry";
import { observeCall, observeTurn, type StuckHit } from "./stuck";
import { byteLen, toolResultRecord, withHarnessNote } from "./toolView";
import { MAX_NUDGES, nudgeText, openItems, verifyPlan } from "./verify";
import {
  RESUMABLE_STOPS,
  type AppliedRef, type ChatReply, type EngineDeps, type ExchangeItem, type ReasoningPayload, type RunCheckpoint,
  type SliceLimits, type SliceResult, type StopReason, type ToolCall, type ToolOutcome, type ToolSpec, type ToolStepRec,
} from "./types";
import type { AgentProposal } from "../types";

export const OUTCOME_UNKNOWN =
  "Outcome unknown: the run stopped after this call started but before its result was recorded. Verify with a read tool (search_content or get_entry) before retrying it.";

const NOT_EXECUTED_STOPPED = "Not executed: the run was stopped before this call started.";
const NOT_EXECUTED_MALFORMED =
  "Not executed: this call's arguments were not valid JSON, probably because the reply was cut off at the output limit. Send it again with fewer calls or shorter content per turn.";
const TRUNCATED_NOTE =
  "Harness note: your last reply was cut off at the output limit, so tool calls in it may be incomplete. Send fewer tool calls per turn, with shorter content.";
const TOO_SLOW_NOTE =
  "Harness note: your last reply took too long to generate and timed out. Reply again with at most three tool calls and short content, and continue with the rest in later turns.";
const AUTO_ANSWER =
  "No one is available to answer during this run. Take the most conservative reasonable option, or mark the affected plan item blocked with a note, and continue.";

/** Unattended jobs: questions answered for the model before the run gives up. */
const MAX_AUTO_ANSWERS = 2;
/** A truncated reply is retried with double the allowance, up to this. */
const MAX_OUTPUT_TOKENS = 16_384;
const MAX_LEDGER_STEPS = 500;
const READ_RETRY_DELAY_MS = 500;

const notExecutedOverLimit = (limit: number) =>
  `Not executed: at most ${limit} tool calls run per turn. Re-issue this call next turn if it is still needed.`;

type SliceOut = { steps: ToolStepRec[]; proposals: AgentProposal[]; applied: AppliedRef[] };
type StopInfo = { detail?: string; message?: string; resumable?: boolean };
type BatchResult = {
  aborted: boolean;
  stuck?: StuckHit;
  question?: { question: string; options: string[]; callId: string };
  /** An unattended job asked more questions than can be answered for it. */
  unanswerable?: boolean;
};

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

function isObjectJson(raw: string): boolean {
  try {
    const v = JSON.parse(raw);
    return Boolean(v) && typeof v === "object" && !Array.isArray(v);
  } catch {
    return false;
  }
}

function existingCallIds(cp: RunCheckpoint): Set<string> {
  const ids = new Set<string>();
  for (const h of cp.history) if (h.kind === "exchange") for (const c of h.calls) ids.add(c.id);
  return ids;
}

/** Unique ids, string arguments, and broken-JSON arguments replaced by {} (so history stays valid) and listed. */
function normalizeCalls(raw: unknown, turn: number, taken: Set<string>): { calls: ToolCall[]; malformed: string[] } {
  if (!Array.isArray(raw)) return { calls: [], malformed: [] };
  const malformed: string[] = [];
  const calls = raw.map((c: any, i: number) => {
    let id = typeof c?.id === "string" && c.id ? c.id : `call_t${turn}_${i}`;
    if (taken.has(id)) id = `${id}_t${turn}_${i}`;
    taken.add(id);
    const rawArgs = c?.function?.arguments;
    let args = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs ?? {});
    if (!args.trim()) args = "{}";
    if (!isObjectJson(args)) {
      malformed.push(id);
      args = "{}";
    }
    return {
      id,
      type: "function" as const,
      function: { name: typeof c?.function?.name === "string" ? c.function.name : "", arguments: args },
    };
  });
  return { calls, malformed };
}

function reasoningOf(reply: ChatReply, requested: string): ReasoningPayload | undefined {
  const content = typeof reply.message.reasoning_content === "string" && reply.message.reasoning_content ? reply.message.reasoning_content : undefined;
  const blocks = Array.isArray(reply.message.thinking_blocks) && reply.message.thinking_blocks.length ? reply.message.thinking_blocks : undefined;
  if (!content && !blocks) return undefined;
  // LiteLLM usually reports the alias we asked for; a different model family means a router fallback.
  const servedBy = reply.model && !sameReasoningTarget(reply.model, requested) ? reply.model : requested;
  return { ...(content ? { content } : {}), ...(blocks ? { thinkingBlocks: blocks } : {}), servedBy };
}

function stopMessageFor(stop: StopReason, lang: "en" | "th", steps: ToolStepRec[], info: StopInfo): string {
  if (info.message) return info.message;
  const th = lang === "th";
  const ok = steps.filter((s) => s.ok).length;
  switch (stop) {
    case "slice_end":
      return th
        ? `หยุดชั่วคราว — ครบขีดจำกัดของรอบนี้ (สำเร็จ ${ok} จาก ${steps.length} ขั้นตอน) กด "ทำต่อ" เพื่อทำงานต่อจากจุดเดิม`
        : `Paused — reached this run's step limit (${ok} of ${steps.length} steps succeeded). Continue to pick up where it left off.`;
    case "retry_later":
      return th
        ? `หยุดชั่วคราว — บริการ AI ไม่ว่างหรือเชื่อมต่อไม่ได้ กด "ทำต่อ" เพื่อลองอีกครั้ง`
        : "Paused — the AI service is busy or unreachable. Continue to try again.";
    case "paused":
      return th ? "หยุดชั่วคราวแล้ว" : "Paused.";
    case "budget":
      return info.resumable === false
        ? th
          ? "หยุดทำงาน — บทสนทนายาวเกินกว่าที่โมเดลอ่านได้ แม้สรุปขั้นตอนเก่าแล้ว เริ่มแชทใหม่เพื่อทำงานที่เหลือ"
          : "Stopped — this conversation is longer than the model can read, even after summarizing older steps. Start a new chat for the remaining work."
        : th
          ? "หยุดชั่วคราว — งานนี้ใช้งบประมาณครบแล้ว"
          : "Paused — this run used up its budget.";
    case "stuck":
      return th
        ? `หยุดทำงาน — agent ทำงานวนซ้ำโดยไม่คืบหน้า (${info.detail || "ไม่มีความคืบหน้า"}) ลองเปลี่ยนคำขอ หรือตรวจสอบว่า agent มีสิทธิ์ที่จำเป็น`
        : `Stopped — the agent was going in circles (${info.detail || "no progress"}). Try rephrasing the request, or check that the agent has access to what it needs.`;
    case "policy":
      return th ? "หยุดทำงาน — agent ไม่มีเครื่องมือที่ใช้ได้ใน workspace นี้แล้ว" : "Stopped — the agent no longer has any tools available in this workspace.";
    case "done_incomplete":
      return th ? `เสร็จสิ้น แต่ยังทำไม่ครบตามแผน — ${info.detail || ""}` : `Finished, but not everything in the plan was done — ${info.detail || ""}`;
    default:
      // "waiting_input" has its question card; "text" and "done" end normally.
      return "";
  }
}

function llmErrorMessage(kind: string, lang: "en" | "th"): string {
  if (kind === "auth" || kind === "not_found") {
    return lang === "th" ? "บริการ AI ปฏิเสธคำขอ — ตรวจสอบคีย์และชื่อโมเดล" : "The AI service rejected the request — check the API key and model name.";
  }
  return lang === "th" ? "เรียก AI ไม่สำเร็จ" : "The AI request failed.";
}

function emitCompaction(cp: RunCheckpoint, deps: EngineDeps, c: CompactionResult): void {
  if (!c.changed) return;
  cp.counters.compactions++;
  deps.emit({ type: "compaction", beforeTokens: c.beforeTokens, afterTokens: c.afterTokens, folded: c.folded });
}

async function execute(deps: EngineDeps, call: ToolCall): Promise<ToolOutcome> {
  try {
    return await deps.tools.execute(call);
  } catch {
    return { ok: false, summary: "Tool failed unexpectedly." , retryable: true };
  }
}

async function runBatch(
  cp: RunCheckpoint, deps: EngineDeps, limits: SliceLimits, signal: AbortSignal | undefined, slice: SliceOut,
  o: { truncated?: boolean } = {},
): Promise<BatchResult> {
  const inflight = cp.inflight!;
  const ex = cp.history[inflight.exchangeIndex] as ExchangeItem;
  const turn = cp.counters.turns;
  const out: BatchResult = { aborted: false };
  let executed = 0;
  let progressed = false;
  let readOnly = true;

  // First detection: a note on the latest result (one per turn). A detection
  // in a later turn, after the model has seen a note, ends the run.
  const react = (hit: StuckHit | null) => {
    if (!hit || out.stuck || !cp.stuck || !ex.results.length) return;
    const noted = cp.stuck.noted;
    if (noted && noted.turn < turn) {
      out.stuck = hit;
      return;
    }
    if (noted?.turn === turn) return;
    const last = ex.results.length - 1;
    ex.results[last] = withHarnessNote(ex.results[last], hit.note, limits);
    cp.stuck.noted = { turn, kind: hit.kind };
  };

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
    if (out.aborted || signal?.aborted) {
      out.aborted = true;
      ex.results.push(toolResultRecord(call.id, name, { ok: false, summary: NOT_EXECUTED_STOPPED }, false, limits));
      continue;
    }
    if (ex.malformed?.includes(call.id)) {
      ex.results.push(toolResultRecord(call.id, name, { ok: false, summary: NOT_EXECUTED_MALFORMED }, false, limits));
      inflight.done.push(call.id);
      continue;
    }

    if (isHarnessTool(name)) {
      const h = runHarnessTool(cp, call);
      let outcome = h.outcome;
      if (h.question && deps.onQuestion === "auto") {
        cp.autoAnswers = (cp.autoAnswers ?? 0) + 1;
        outcome = { ok: true, summary: AUTO_ANSWER };
        if (cp.autoAnswers > MAX_AUTO_ANSWERS) out.unanswerable = true;
      } else {
        for (const e of h.events) deps.emit(e);
        if (h.question) out.question = { ...h.question, callId: call.id };
      }
      // Keeping the plan current counts as progress; a question does not.
      if (outcome.ok && !h.question) progressed = true;
      executed++;
      ex.results.push(toolResultRecord(call.id, name, outcome, true, limits));
      react(observeCall(cp, { turn, name, args: call.function.arguments, ok: outcome.ok, summary: outcome.summary }));
      inflight.done.push(call.id);
      continue;
    }

    const write = deps.tools.isWrite(name);
    deps.emit({ type: "tool_call", id: call.id, name, args: safeArgs(call.function.arguments) });
    if (write) {
      inflight.pendingWrite = call.id;
      if (deps.save) await deps.save(cp, "pre_write");
    }

    let result = await execute(deps, call);
    if (!result.ok && result.retryable && !write && !signal?.aborted) {
      cp.counters.retries++;
      try {
        await deps.clock.sleep(READ_RETRY_DELAY_MS, signal);
        result = await execute(deps, call);
      } catch {
        /* stopped while waiting: keep the first outcome */
      }
    }

    cp.counters.toolCalls++;
    executed++;
    if (write) {
      readOnly = false;
      if (result.ok) progressed = true;
    }
    ex.results.push(toolResultRecord(call.id, name, result, true, limits));
    react(observeCall(cp, { turn, name, args: call.function.arguments, ok: result.ok, summary: result.summary }));

    const step: ToolStepRec = { name, ok: result.ok, summary: result.summary };
    cp.ledger.toolSteps.push(step);
    if (cp.ledger.toolSteps.length > MAX_LEDGER_STEPS) cp.ledger.toolSteps.splice(0, cp.ledger.toolSteps.length - MAX_LEDGER_STEPS);
    slice.steps.push(step);
    if (result.proposal) {
      cp.ledger.proposals.push(result.proposal);
      slice.proposals.push(result.proposal);
    } else if (result.ok && result.data?.uid && result.data?.id) {
      const ref = { uid: String(result.data.uid), id: String(result.data.id) };
      cp.ledger.applied.push(ref);
      slice.applied.push(ref);
    }
    deps.emit({ type: "tool_result", id: call.id, ok: result.ok, summary: result.summary, data: result.proposal ? undefined : result.data });
    if (result.proposal) deps.emit({ type: "proposal", proposal: result.proposal });
    for (const e of deps.afterTool?.(cp, call, result) ?? []) deps.emit(e);

    inflight.pendingWrite = undefined;
    inflight.done.push(call.id);
  }

  if (executed) react(observeTurn(cp, { turn, progressed, readOnly }, cp.mode));
  const last = ex.results.length - 1;
  if (o.truncated && last >= 0 && !ex.results[last].full.startsWith('{"harness_note"')) {
    ex.results[last] = withHarnessNote(ex.results[last], TRUNCATED_NOTE, limits);
  }
  cp.inflight = undefined;
  if (deps.save) await deps.save(cp, "turn");
  return out;
}

/** One model reply for the current turn, with retries, repair, compaction and larger allowances handled. */
async function requestReply(
  cp: RunCheckpoint, deps: EngineDeps, limits: SliceLimits, signal: AbortSignal | undefined,
  o: { system: string; specs: ToolSpec[]; t0: number },
): Promise<{ reply: ChatReply; truncated: boolean } | { stop: StopReason; info?: StopInfo }> {
  const state: RetryState = { compacted: false, repaired: false };
  let emptyRetried = false;
  let askedShorter = false;
  let maxTokens = limits.maxTokens;

  for (let attempt = 1; ; attempt++) {
    let messages = buildWireMessages(cp, { system: o.system, targetModel: cp.model, digestAfterBytes: limits.digestAfterBytes });
    const errors = checkProtocol(messages, { toolsSent: o.specs.length > 0 }).filter((v) => v.severity === "error");
    if (errors.length && deps.strictProtocol) throw new ProtocolError(errors);
    if (errors.length || state.repaired) {
      const fixed = repairHistory(messages);
      messages = fixed.messages;
      cp.counters.protocolRepairs += fixed.repairs;
    }
    const bytes = byteLen(JSON.stringify(messages)) + (o.specs.length ? byteLen(JSON.stringify(o.specs)) : 0);
    const elapsed = deps.clock.now() - o.t0;

    let reply: ChatReply;
    try {
      reply = await deps.chat({
        messages,
        tools: o.specs.length ? o.specs : undefined,
        model: cp.model || undefined,
        maxTokens,
        signal: linkSignals(signal, timeoutSignal(Math.min(limits.llmTimeoutMs, Math.max(0, limits.maxWallMs - elapsed) + 30_000))),
      });
    } catch (err) {
      if (signal?.aborted) return { stop: "aborted" };
      const d = decideRetry(err, attempt, { maxAttempts: limits.maxLlmAttempts, mode: cp.mode, state, random: deps.random });
      if (d.action === "retry") {
        if (deps.clock.now() - o.t0 + d.delayMs >= limits.maxWallMs) return { stop: "retry_later" };
        cp.counters.retries++;
        deps.emit({ type: "retry", attempt, delayMs: d.delayMs, reason: d.reason });
        // Regenerating the same oversized reply times out again (found live); ask for a smaller one.
        if (d.reason === "timeout" && !askedShorter) {
          askedShorter = true;
          cp.history.push({ kind: "user", text: TOO_SLOW_NOTE });
        }
        try {
          await deps.clock.sleep(d.delayMs, signal);
        } catch {
          return { stop: "aborted" };
        }
        continue;
      }
      if (d.action === "compact") {
        state.compacted = true;
        // The provider counted more tokens than estimated; trust it from here on.
        cp.tokenRatio = (cp.tokenRatio ?? DEFAULT_TOKEN_RATIO) * 1.5;
        const c = compactHistory(cp, { system: o.system, specs: o.specs, limits, aggressive: true });
        emitCompaction(cp, deps, c);
        if (!c.changed) return { stop: "budget", info: { resumable: false } };
        cp.counters.retries++;
        continue;
      }
      if (d.action === "repair") {
        state.repaired = true;
        cp.counters.retries++;
        continue;
      }
      if (d.action === "later") return { stop: "retry_later" };
      deps.emit({ type: "error", code: "llm", message: llmErrorMessage(d.reason, cp.lang) });
      return { stop: "llm_error" };
    }

    if (reply.usage) {
      cp.counters.promptTokens += Number(reply.usage.prompt_tokens) || 0;
      cp.counters.completionTokens += Number(reply.usage.completion_tokens) || 0;
      cp.tokenRatio = calibrateRatio(cp.tokenRatio, Number(reply.usage.prompt_tokens) || 0, bytes);
    }

    // A reasoning model can spend the whole allowance thinking: retry with more room, up to a cap.
    if (reply.finishReason === "length" && maxTokens < MAX_OUTPUT_TOKENS) {
      maxTokens = Math.min(maxTokens * 2, MAX_OUTPUT_TOKENS);
      cp.counters.retries++;
      deps.emit({ type: "retry", attempt, delayMs: 0, reason: "truncated" });
      continue;
    }
    const hasCalls = Array.isArray(reply.message.tool_calls) && reply.message.tool_calls.length > 0;
    const text = typeof reply.message.content === "string" ? reply.message.content : "";
    if (!hasCalls && !text.trim() && !emptyRetried) {
      emptyRetried = true;
      cp.counters.retries++;
      deps.emit({ type: "retry", attempt, delayMs: 0, reason: "empty" });
      continue;
    }
    return { reply, truncated: reply.finishReason === "length" };
  }
}

/** Runs one bounded slice of a conversation and returns the updated checkpoint. Never mutates `input`. */
export async function runSlice(input: RunCheckpoint, deps: EngineDeps, limits: SliceLimits, signal?: AbortSignal): Promise<SliceResult> {
  const cp: RunCheckpoint = structuredClone(input);
  cp.counters = { ...emptyCounters(), ...cp.counters };
  const t0 = deps.clock.now();
  const slice: SliceOut = { steps: [], proposals: [], applied: [] };
  let sliceTurns = 0;

  const finish = async (stop: StopReason, finalText = "", info: StopInfo = {}): Promise<SliceResult> => {
    cp.lastStop = stop;
    cp.counters.ms += Math.max(0, deps.clock.now() - t0);
    const resumable = RESUMABLE_STOPS.has(stop) && info.resumable !== false;
    const stopMessage = stopMessageFor(stop, cp.lang, slice.steps, info);
    if (stopMessage) deps.emit({ type: "stopped", reason: stop, resumable, message: stopMessage });
    if (deps.save) await deps.save(cp, "stop");
    return { checkpoint: cp, stop, resumable, finalText, stopMessage, ...slice };
  };

  const afterBatch = (b: BatchResult): Promise<SliceResult> | null => {
    if (b.aborted) return finish("aborted");
    if (b.stuck) return finish("stuck", "", { detail: b.stuck.detail });
    if (b.unanswerable) {
      return finish("done_incomplete", "", {
        message: cp.lang === "th"
          ? "หยุดทำงาน — งานนี้ต้องการการตัดสินใจที่ไม่มีใครตอบได้ในขณะนี้"
          : "Stopped — the job needed decisions that no one was available to make.",
      });
    }
    if (b.question) {
      cp.waiting = b.question;
      return finish("waiting_input");
    }
    return null;
  };

  if (cp.inflight) {
    const stopped = afterBatch(await runBatch(cp, deps, limits, signal, slice));
    if (stopped) return stopped;
  }

  for (;;) {
    if (signal?.aborted) return finish("aborted");
    if (deps.control) {
      const c = await deps.control();
      if (c === "cancel") return finish("cancelled");
      if (c === "pause") return finish("paused");
      if (c === "budget") return finish("budget");
    }
    if (sliceTurns >= limits.maxTurns || deps.clock.now() - t0 >= limits.maxWallMs) return finish("slice_end");

    const cmsSpecs = deps.tools.specs();
    if (!cmsSpecs.length && cp.history.some((h) => h.kind === "exchange")) return finish("policy");
    const specs = [...harnessSpecs(), ...cmsSpecs];

    const system = deps.systemPrompt();
    const compaction = compactHistory(cp, { system, specs, limits });
    emitCompaction(cp, deps, compaction);
    if (compaction.overLimit) return finish("budget", "", { resumable: false });

    deps.emit({ type: "thinking", turn: cp.counters.turns + 1 });
    const got = await requestReply(cp, deps, limits, signal, { system, specs, t0 });
    if ("stop" in got) return finish(got.stop, "", got.info);
    const reply = got.reply;

    sliceTurns++;
    cp.counters.turns++;
    const reasoning = reasoningOf(reply, cp.model);
    const { calls, malformed } = normalizeCalls(reply.message.tool_calls, cp.counters.turns, existingCallIds(cp));
    const text = typeof reply.message.content === "string" ? reply.message.content : "";

    if (!calls.length) {
      if (text.trim()) {
        cp.history.push({ kind: "assistant_text", text, ...(reasoning ? { reasoning } : {}) });
        deps.emit({ type: "text", content: text });
      }
      for (const e of deps.checkPlan?.(cp) ?? []) deps.emit(e);
      const open = openItems(cp.plan);
      if (cp.plan && open.length && cp.plan.nudges < MAX_NUDGES) {
        cp.plan.nudges++;
        cp.history.push({ kind: "user", text: nudgeText(open) });
        continue;
      }
      if (!cp.plan) return finish("text", text);
      const v = verifyPlan(cp.plan);
      deps.emit({ type: "verification", ok: v.ok, report: v.report });
      return finish(v.ok ? "done" : "done_incomplete", text, { detail: v.report });
    }

    cp.history.push({
      kind: "exchange", text: text || null, ...(reasoning ? { reasoning } : {}), calls, results: [],
      ...(malformed.length ? { malformed } : {}),
    });
    cp.inflight = { exchangeIndex: cp.history.length - 1, done: [] };
    if (deps.save) await deps.save(cp, "turn");
    const stopped = afterBatch(await runBatch(cp, deps, limits, signal, slice, { truncated: got.truncated }));
    if (stopped) return stopped;
  }
}
