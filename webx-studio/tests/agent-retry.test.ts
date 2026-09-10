// Model-request and tool retries (lib/agent/engine/retry.ts and the loop).
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { startRun } from "../lib/agent/engine/checkpoint";
import { LlmError, type LlmErrorKind } from "../lib/agent/engine/errors";
import { limitsFor } from "../lib/agent/engine/limits";
import { runSlice } from "../lib/agent/engine/loop";
import { backoffMs, decideRetry } from "../lib/agent/engine/retry";
import { toolResultRecord } from "../lib/agent/engine/toolView";
import type { EngineDeps, EngineTools, RunCheckpoint, RunMode } from "../lib/agent/engine/types";
import type { AgentEvent } from "../lib/agent/types";
import { fakeClock } from "./harness/fakeClock";
import { fakeTools } from "./harness/fakeTools";
import { replyText, replyTools, scriptedChat, toolCall, type ScriptedChat } from "./harness/scriptedChat";

const llmErr = (status: number, kind: LlmErrorKind, extra: { retryAfterMs?: number; body?: string } = {}) =>
  new LlmError(`LLM_HTTP_${status}`, { status, kind, ...extra });
const fresh = () => ({ compacted: false, repaired: false });

function newRun(mode: RunMode = "docked", model = "webx-kimi"): RunCheckpoint {
  return startRun({ runId: "run-1", threadId: "thread-1", mode, lang: "en", ref: { kind: "none" }, model, message: "Do the task" });
}

function harness(chat: ScriptedChat, tools: EngineTools, extra: Partial<EngineDeps> = {}) {
  const events: AgentEvent[] = [];
  const clock = fakeClock();
  const deps: EngineDeps = {
    chat: chat.chat, tools, clock, emit: (e) => events.push(e), systemPrompt: () => "You are the WebX test agent.",
    strictProtocol: true, random: () => 0, ...extra,
  };
  return { deps, events, clock };
}

const noTools = () => fakeTools({}).tools;

describe("decideRetry", () => {
  test("transient failures retry until the attempt limit, then pause to try again later", () => {
    for (const kind of ["network", "timeout", "rate_limit", "server"] as const) {
      assert.equal(decideRetry(llmErr(500, kind), 1, { maxAttempts: 3, mode: "docked", state: fresh() }).action, "retry", kind);
      assert.equal(decideRetry(llmErr(500, kind), 3, { maxAttempts: 3, mode: "docked", state: fresh() }).action, "later", kind);
    }
    assert.equal(decideRetry(llmErr(503, "server"), 5, { maxAttempts: 5, mode: "job", state: fresh() }).action, "later");
  });

  test("a context overflow compacts once and a tool-structure 400 repairs once", () => {
    assert.equal(decideRetry(llmErr(400, "context_length"), 1, { maxAttempts: 3, mode: "docked", state: fresh() }).action, "compact");
    assert.equal(decideRetry(llmErr(400, "context_length"), 2, { maxAttempts: 3, mode: "docked", state: { compacted: true, repaired: false } }).action, "fail");
    const structural = llmErr(400, "bad_request", { body: "An assistant message with 'tool_calls' must be followed by tool messages" });
    assert.equal(decideRetry(structural, 1, { maxAttempts: 3, mode: "docked", state: fresh() }).action, "repair");
    assert.equal(decideRetry(structural, 2, { maxAttempts: 3, mode: "docked", state: { compacted: false, repaired: true } }).action, "fail");
  });

  test("auth, unknown model, other 400s and non-LLM errors fail at once", () => {
    for (const e of [llmErr(401, "auth"), llmErr(404, "not_found"), llmErr(400, "bad_request", { body: "temperature out of range" }), new Error("boom")]) {
      assert.equal(decideRetry(e, 1, { maxAttempts: 3, mode: "job", state: fresh() }).action, "fail");
    }
  });
});

describe("backoffMs", () => {
  test("doubles from 1s to a 30s cap, jittered within the upper half", () => {
    assert.equal(backoffMs(1, () => 0), 500);
    assert.equal(backoffMs(1, () => 1), 1000);
    assert.equal(backoffMs(3, () => 1), 4000);
    assert.equal(backoffMs(10, () => 1), 30_000);
    assert.equal(backoffMs(10, () => 0), 15_000);
  });

  test("never waits less than the provider's Retry-After", () => {
    assert.equal(backoffMs(1, () => 0, 7000), 7000);
    assert.equal(backoffMs(3, () => 1, 100), 4000);
  });
});

describe("model request retries in the loop", () => {
  test("a 429 waits out Retry-After on the clock, then the turn succeeds", async () => {
    const chat = scriptedChat([{ throws: llmErr(429, "rate_limit", { retryAfterMs: 2000 }) }, { reply: replyText("Done.") }]);
    const h = harness(chat, noTools());
    const start = h.clock.now();
    const r = await runSlice(newRun(), h.deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.equal(h.clock.now() - start, 2000);
    assert.equal(r.checkpoint.counters.retries, 1);
    assert.deepEqual(h.events.filter((e) => e.type === "retry").map((e: any) => [e.attempt, e.delayMs, e.reason]), [[1, 2000, "rate_limit"]]);
  });

  test("chat pauses resumably after three failed attempts, so Continue can try again (found live: repeated timeouts ended the run)", async () => {
    const chat = scriptedChat([{ throws: llmErr(503, "server") }, { throws: llmErr(503, "server") }, { throws: llmErr(503, "server") }]);
    const h = harness(chat, noTools());
    const r = await runSlice(newRun(), h.deps, limitsFor("docked"));

    assert.equal(r.stop, "retry_later");
    assert.equal(r.resumable, true);
    assert.equal(chat.requests.length, 3);
    assert.equal(h.events.some((e) => e.type === "error"), false);
    const stopped = h.events.find((e) => e.type === "stopped");
    assert.ok(stopped && stopped.type === "stopped" && stopped.resumable);
  });

  test("after a timeout the retry asks the model for a smaller reply (found live: an oversized batch kept timing out)", async () => {
    const chat = scriptedChat([
      { throws: llmErr(0, "timeout") },
      { expect: (req) => assert.match(String(req.messages[req.messages.length - 1].content), /took too long to generate/), reply: replyText("Done.") },
    ]);
    const r = await runSlice(newRun(), harness(chat, noTools()).deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "text");
  });

  test("a job out of attempts stops resumably so it can be retried later", async () => {
    const chat = scriptedChat(Array.from({ length: 5 }, () => ({ throws: llmErr(502, "server") })));
    const h = harness(chat, noTools());
    const r = await runSlice(newRun("job"), h.deps, limitsFor("job"));

    assert.equal(r.stop, "retry_later");
    assert.equal(r.resumable, true);
    assert.equal(chat.requests.length, 5);
  });

  test("a wait that would not fit in the slice stops resumably instead of sleeping", async () => {
    const chat = scriptedChat([{ throws: llmErr(429, "rate_limit", { retryAfterMs: 200_000 }) }]);
    const h = harness(chat, noTools());
    const start = h.clock.now();
    const r = await runSlice(newRun(), h.deps, limitsFor("docked"));

    assert.equal(r.stop, "retry_later");
    assert.equal(h.clock.now(), start);
    const stopped = h.events.find((e) => e.type === "stopped");
    assert.ok(stopped && stopped.type === "stopped" && stopped.resumable);
  });

  test("an unknown model fails at once with a message about the configuration", async () => {
    const chat = scriptedChat([{ throws: llmErr(404, "not_found") }]);
    const h = harness(chat, noTools());
    const r = await runSlice(newRun(), h.deps, limitsFor("docked"));

    assert.equal(r.stop, "llm_error");
    assert.equal(chat.requests.length, 1);
    const error = h.events.find((e) => e.type === "error");
    assert.ok(error && error.type === "error" && /model name/.test(error.message));
  });

  test("a truncated reply is retried once with double the token allowance", async () => {
    const chat = scriptedChat([
      { reply: { message: { content: "" }, finishReason: "length", usage: { prompt_tokens: 50, completion_tokens: 1200 } } },
      { reply: replyText("Done.") },
    ]);
    const limits = limitsFor("docked");
    const r = await runSlice(newRun(), harness(chat, noTools()).deps, limits);

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.equal(chat.requests[0].maxTokens, limits.maxTokens);
    assert.equal(chat.requests[1].maxTokens, limits.maxTokens * 2);
    assert.equal(r.checkpoint.counters.completionTokens, 1220);
  });

  test("a reply cut off even at the largest allowance has its broken calls answered, not run (found live)", async () => {
    const tools = fakeTools({ create_draft_entry: { write: true, run: () => ({ ok: true, summary: "Created" }) } });
    const cutOff = {
      message: {
        content: null,
        tool_calls: [
          toolCall("create_draft_entry", { title: "A" }, "w1"),
          { id: "w2", type: "function" as const, function: { name: "create_draft_entry", arguments: '{"title":"B","body":"ข่าวประชาสัมพ' } },
        ],
      },
      finishReason: "length",
      usage: { prompt_tokens: 100, completion_tokens: 4096 },
    };
    const chat = scriptedChat([
      { reply: cutOff },
      { reply: cutOff },
      { reply: cutOff },
      {
        expect: (req) => {
          const results = req.messages.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content as string));
          assert.equal(results[0].ok, true);
          assert.match(results[1].summary, /not valid JSON/);
          assert.match(results[1].harness_note, /cut off at the output limit/);
        },
        reply: replyText("Created A; B needs another try."),
      },
    ]);
    const r = await runSlice(newRun(), harness(chat, tools.tools).deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.deepEqual(chat.requests.map((q) => q.maxTokens), [4096, 8192, 16384, 4096]);
    assert.equal(tools.calls.length, 1);
  });

  test("a provider 400 about the tool-call structure is retried once after repairing the history", async () => {
    const chat = scriptedChat([{ throws: llmErr(400, "bad_request", { body: "tool_call_id not found in the conversation" }) }, { reply: replyText("Done.") }]);
    const r = await runSlice(newRun(), harness(chat, noTools()).deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.equal(chat.requests.length, 2);
  });

  test("a context-length error compacts the history aggressively and retries", async () => {
    const limits = limitsFor("docked");
    const cp = newRun("docked", "webx-local");
    for (let i = 0; i < 6; i++) {
      const id = `c${i}`;
      cp.history.push({
        kind: "exchange", text: null, calls: [toolCall("get_entry", { id }, id)],
        results: [toolResultRecord(id, "get_entry", { ok: true, summary: "Loaded", data: { uid: "api::news.news", id: `doc-${i}`, body: "x".repeat(4000) } }, true, limits)],
      });
    }
    const tools = fakeTools({ get_entry: { run: () => ({ ok: true, summary: "Loaded" }) } });
    const chat = scriptedChat([
      { throws: llmErr(400, "context_length", { body: "This model's maximum context length is 32000 tokens" }) },
      {
        expect: (req) => {
          const first = req.messages.find((m) => m.role === "tool" && m.tool_call_id === "c0");
          const recent = req.messages.find((m) => m.role === "tool" && m.tool_call_id === "c5");
          assert.ok(!first || JSON.parse(first.content as string).digest, "old results are digests or folded away");
          assert.equal(JSON.parse(recent!.content as string).digest, undefined, "the latest exchange keeps its full result");
        },
        reply: replyText("Done."),
      },
    ]);
    const h = harness(chat, tools.tools);
    const r = await runSlice(cp, h.deps, limits);

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.ok(r.checkpoint.counters.compactions >= 1);
    assert.ok(h.events.some((e) => e.type === "compaction"));
  });
});

describe("tool retries", () => {
  test("a read tool that fails transiently is retried once", async () => {
    let n = 0;
    const tools = fakeTools({
      get_entry: { run: () => (++n === 1 ? { ok: false, summary: "get failed: Internal Server Error", retryable: true } : { ok: true, summary: "Loaded" }) },
    });
    const chat = scriptedChat([
      { reply: replyTools([toolCall("get_entry", { id: "1" }, "c1")]) },
      { expect: (req) => assert.equal(JSON.parse(req.messages[req.messages.length - 1].content as string).ok, true), reply: replyText("Done.") },
    ]);
    const r = await runSlice(newRun(), harness(chat, tools.tools).deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.equal(tools.calls.length, 2);
    assert.equal(r.checkpoint.counters.toolCalls, 1);
  });

  test("a write tool is never retried", async () => {
    const tools = fakeTools({
      create_draft_entry: { write: true, run: () => ({ ok: false, summary: "create failed: Internal Server Error", retryable: true }) },
    });
    const chat = scriptedChat([
      { reply: replyTools([toolCall("create_draft_entry", { title: "A" }, "w1")]) },
      { expect: (req) => assert.equal(JSON.parse(req.messages[req.messages.length - 1].content as string).ok, false), reply: replyText("It failed.") },
    ]);
    const r = await runSlice(newRun(), harness(chat, tools.tools).deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.equal(tools.calls.length, 1);
  });
});
