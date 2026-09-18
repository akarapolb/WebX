// Engine regression tests (Phase 9, M1): the loop bugs found dogfooding the
// agent with Kimi K3, plus crash and resume behaviour. Everything runs
// in-process against lib/agent/engine with a scripted model, and every
// request the engine sends is checked against the provider protocol.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { applyInput, buildWireMessages, fitCheckpoint, parseCheckpoint, startRun } from "../lib/agent/engine/checkpoint";
import { LlmError } from "../lib/agent/engine/errors";
import { limitsFor } from "../lib/agent/engine/limits";
import { OUTCOME_UNKNOWN, runSlice } from "../lib/agent/engine/loop";
import { boundedJson, byteLen, toolResultRecord } from "../lib/agent/engine/toolView";
import type { ChatRequest, EngineDeps, EngineTools, ExchangeItem, RunCheckpoint, WireMsg } from "../lib/agent/engine/types";
import type { AgentEvent } from "../lib/agent/types";
import { fakeClock } from "./harness/fakeClock";
import { fakeTools } from "./harness/fakeTools";
import { memoryStore, SimulatedCrash } from "./harness/memoryStore";
import { replyText, replyTools, scriptedChat, toolCall, type ScriptedChat } from "./harness/scriptedChat";

const LIMITS = limitsFor("workspace");

function newRun(message = "Create the drafts", model = "webx-kimi"): RunCheckpoint {
  return startRun({ runId: "run-1", threadId: "thread-1", mode: "workspace", lang: "en", ref: { kind: "none" }, model, message });
}

function depsFor(chat: ScriptedChat, tools: EngineTools, extra: Partial<EngineDeps> = {}) {
  const events: AgentEvent[] = [];
  const deps: EngineDeps = {
    chat: chat.chat,
    tools,
    clock: fakeClock(),
    emit: (e) => events.push(e),
    systemPrompt: () => "You are the WebX test agent.",
    strictProtocol: true,
    ...extra,
  };
  return { deps, events };
}

const toolMessages = (req: ChatRequest) => req.messages.filter((m) => m.role === "tool");

function toolResult(req: ChatRequest, callId: string): any {
  const m = toolMessages(req).find((x) => x.tool_call_id === callId);
  assert.ok(m, `no tool message for ${callId}`);
  return JSON.parse(m.content as string);
}

const stoppedEvents = (events: AgentEvent[]) =>
  events.filter((e): e is Extract<AgentEvent, { type: "stopped" }> => e.type === "stopped");

const exchanges = (cp: RunCheckpoint) => cp.history.filter((h): h is ExchangeItem => h.kind === "exchange");

describe("bug 2 — tool data reaches the model", () => {
  test("an id returned by a create call is visible on the next request", async () => {
    const tools = fakeTools({
      create_draft_entry: { write: true, run: () => ({ ok: true, summary: "Created draft", data: { uid: "api::news.news", id: "doc-123" } }) },
      insert_blocks: { write: true, run: () => ({ ok: true, summary: "Inserted 1 block" }) },
    });
    const chat = scriptedChat([
      { reply: replyTools([toolCall("create_draft_entry", { uid: "api::news.news", fields: { title: "Hi" } }, "c1")]) },
      {
        expect: (req) => assert.equal(toolResult(req, "c1").data.id, "doc-123"),
        reply: replyTools([toolCall("insert_blocks", { uid: "api::news.news", id: "doc-123" }, "c2")]),
      },
      { reply: replyText("Done.") },
    ]);
    const { deps, events } = depsFor(chat, tools.tools);
    const r = await runSlice(newRun(), deps, LIMITS);

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.equal(r.finalText, "Done.");
    assert.deepEqual(tools.calls.map((c) => c.args.id ?? null), [null, "doc-123"]);
    assert.deepEqual(r.applied, [{ uid: "api::news.news", id: "doc-123" }]);
    assert.equal(stoppedEvents(events).length, 0);
    assert.equal(chat.remaining(), 0);
  });

  test("old results are sent as digests that still carry the ids", async () => {
    const padding = "x".repeat(3000);
    const tools = fakeTools({
      create_draft_entry: { write: true, run: () => ({ ok: true, summary: "Created draft", data: { uid: "api::news.news", id: "doc-123", body: padding } }) },
      get_entry: { run: (a) => ({ ok: true, summary: "Loaded", data: { id: a.id, body: padding } }) },
    });
    const chat = scriptedChat([
      { reply: replyTools([toolCall("create_draft_entry", {}, "c1")]) },
      { reply: replyTools([toolCall("get_entry", { id: "a" }, "c2")]) },
      { reply: replyTools([toolCall("get_entry", { id: "b" }, "c3")]) },
      {
        expect: (req) => {
          const first = toolResult(req, "c1");
          assert.equal(first.digest, true);
          assert.ok(first.ids.some((x: any) => x.id === "doc-123"));
          assert.equal(toolResult(req, "c2").digest, undefined);
          assert.equal(toolResult(req, "c3").digest, undefined);
        },
        reply: replyText("Done."),
      },
    ]);
    const r = await runSlice(newRun(), depsFor(chat, tools.tools).deps, { ...LIMITS, digestAfterBytes: 1024 });

    chat.assertClean();
    assert.equal(r.stop, "text");
  });
});

describe("bug 3 — more tool calls than the per-turn limit", () => {
  test("every call gets an answer, and only the first N run", async () => {
    const tools = fakeTools({ get_entry: { run: (a) => ({ ok: true, summary: `Loaded ${a.id}`, data: { id: a.id } }) } });
    const calls = Array.from({ length: 18 }, (_, i) => toolCall("get_entry", { id: `e${i}` }, `c${i}`));
    const chat = scriptedChat([
      { reply: replyTools(calls) },
      {
        expect: (req) => {
          const assistant = req.messages.find((m) => m.role === "assistant" && m.tool_calls?.length);
          assert.equal(assistant?.tool_calls?.length, 18);
          const results = toolMessages(req).map((m) => JSON.parse(m.content as string));
          assert.equal(results.length, 18);
          assert.equal(results.filter((x) => /^Not executed/.test(x.summary)).length, 12);
        },
        reply: replyText("Loaded six."),
      },
    ]);
    const r = await runSlice(newRun(), depsFor(chat, tools.tools).deps, { ...LIMITS, maxToolCallsPerTurn: 6 });

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.equal(tools.calls.length, 6);
    assert.equal(r.checkpoint.counters.toolCalls, 6);
    assert.deepEqual(exchanges(r.checkpoint)[0].results.map((x) => x.executed).filter(Boolean).length, 6);
  });

  test("a provider reusing call ids across turns does not corrupt the history", async () => {
    const tools = fakeTools({ get_entry: { run: () => ({ ok: true, summary: "Loaded" }) } });
    const chat = scriptedChat([
      { reply: replyTools([toolCall("get_entry", { id: "a" }, "functions.get_entry:0")]) },
      { reply: replyTools([toolCall("get_entry", { id: "b" }, "functions.get_entry:0")]) },
      { reply: replyText("Done.") },
    ]);
    const r = await runSlice(newRun(), depsFor(chat, tools.tools).deps, LIMITS);

    chat.assertClean();
    assert.equal(r.stop, "text");
    const ids = exchanges(r.checkpoint).flatMap((h) => h.calls.map((c) => c.id));
    assert.equal(new Set(ids).size, 2);
  });
});

describe("bug 5 — running out of turns", () => {
  test("stops resumably with a message, and the saved checkpoint finishes the work", async () => {
    const tools = fakeTools({
      create_draft_entry: { write: true, run: (a) => ({ ok: true, summary: `Created ${a.n}`, data: { uid: "api::news.news", id: `d${a.n}` } }) },
    });
    const chat = scriptedChat([
      { reply: replyTools([toolCall("create_draft_entry", { n: 1 }, "c1")]) },
      { reply: replyTools([toolCall("create_draft_entry", { n: 2 }, "c2")]) },
      {
        expect: (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.equal(last.role, "user");
          assert.equal(last.content, "Continue");
        },
        reply: replyTools([toolCall("create_draft_entry", { n: 3 }, "c3")]),
      },
      { reply: replyText("Created three drafts.") },
    ]);

    const first = depsFor(chat, tools.tools);
    const r1 = await runSlice(newRun(), first.deps, { ...LIMITS, maxTurns: 2 });
    chat.assertClean();
    assert.equal(r1.stop, "slice_end");
    assert.match(r1.stopMessage, /step limit/);
    const stops = stoppedEvents(first.events);
    assert.equal(stops.length, 1);
    assert.equal(stops[0].resumable, true);

    const saved = parseCheckpoint(JSON.stringify(r1.checkpoint));
    assert.ok(saved);
    const second = depsFor(chat, tools.tools);
    const r2 = await runSlice(applyInput(saved, { kind: "message", text: "Continue" }), second.deps, { ...LIMITS, maxTurns: 2 });

    chat.assertClean();
    assert.equal(r2.stop, "text");
    assert.equal(r2.finalText, "Created three drafts.");
    assert.equal(stoppedEvents(second.events).length, 0);
    assert.deepEqual(tools.calls.map((c) => c.args.n), [1, 2, 3]);
    assert.equal(r2.checkpoint.ledger.applied.length, 3);
  });

  test("a slice stops starting turns once its wall-clock budget is spent", async () => {
    const clock = fakeClock();
    const tools = fakeTools({ get_entry: { run: () => ({ ok: true, summary: "Loaded" }) } });
    const chat = scriptedChat([{ expect: () => clock.advance(LIMITS.maxWallMs), reply: replyTools([toolCall("get_entry", {}, "c1")]) }]);
    const r = await runSlice(newRun(), depsFor(chat, tools.tools, { clock }).deps, LIMITS);

    chat.assertClean();
    assert.equal(r.stop, "slice_end");
    assert.equal(tools.calls.length, 1);
  });
});

describe("bug 6 — reasoning passthrough", () => {
  test("Kimi's reasoning_content is echoed on its own tool-call message within the turn", async () => {
    const tools = fakeTools({ get_entry: { run: () => ({ ok: true, summary: "Loaded" }) } });
    const chat = scriptedChat([
      { reply: replyTools([toolCall("get_entry", {}, "c1")], { reasoning: "Need the entry first.", model: "moonshot/kimi-k3" }) },
      {
        expect: (req) => assert.equal(req.messages.find((m) => m.role === "assistant")?.reasoning_content, "Need the entry first."),
        reply: replyText("Done."),
      },
    ]);
    const r = await runSlice(newRun("Check it", "webx-kimi"), depsFor(chat, tools.tools).deps, LIMITS);

    chat.assertClean();
    assert.equal(r.stop, "text");
  });

  test("reasoning from a router fallback in another model family is not sent to the requested model", async () => {
    const tools = fakeTools({ get_entry: { run: () => ({ ok: true, summary: "Loaded" }) } });
    const chat = scriptedChat([
      { reply: replyTools([toolCall("get_entry", {}, "c1")], { reasoning: "Fallback thoughts.", model: "gemini-2.5-pro" }) },
      {
        expect: (req) => assert.equal(req.messages.find((m) => m.role === "assistant")?.reasoning_content, undefined),
        reply: replyText("Done."),
      },
    ]);
    const r = await runSlice(newRun("Check it", "webx-kimi"), depsFor(chat, tools.tools).deps, LIMITS);

    chat.assertClean();
    assert.equal(r.stop, "text");
  });

  test("reasoning is dropped when the target family changes or a newer user turn exists", () => {
    const cp = newRun("First", "webx-kimi");
    cp.history.push({
      kind: "exchange", text: null, reasoning: { content: "r1", servedBy: "webx-kimi" },
      calls: [toolCall("get_entry", {}, "c1")],
      results: [toolResultRecord("c1", "get_entry", { ok: true, summary: "Loaded" }, true, LIMITS)],
    });
    const opts = { system: "sys", digestAfterBytes: LIMITS.digestAfterBytes };
    const echoed = (msgs: WireMsg[]) => msgs.filter((m) => m.role === "assistant").map((m) => m.reasoning_content ?? null);

    assert.deepEqual(echoed(buildWireMessages(cp, { ...opts, targetModel: "webx-kimi" })), ["r1"]);
    assert.deepEqual(echoed(buildWireMessages(cp, { ...opts, targetModel: "webx-default" })), [null]);
    const later = applyInput(cp, { kind: "message", text: "Next" });
    assert.deepEqual(echoed(buildWireMessages(later, { ...opts, targetModel: "webx-kimi" })), [null]);
  });

  test("Anthropic thinking blocks go back verbatim to the same family", () => {
    const blocks = [{ type: "thinking", thinking: "Plan the edit.", signature: "sig-1" }];
    const cp = newRun("Edit", "webx-default");
    cp.history.push({
      kind: "exchange", text: null, reasoning: { thinkingBlocks: blocks, servedBy: "webx-default" },
      calls: [toolCall("get_entry", {}, "c1")],
      results: [toolResultRecord("c1", "get_entry", { ok: true, summary: "Loaded" }, true, LIMITS)],
    });
    const a = buildWireMessages(cp, { system: "sys", targetModel: "webx-default", digestAfterBytes: LIMITS.digestAfterBytes }).find((m) => m.role === "assistant");
    assert.deepEqual(a?.thinking_blocks, blocks);
    assert.equal(a?.reasoning_content, undefined);
  });
});

describe("crash and resume", () => {
  test("a write interrupted by a crash is reported as outcome unknown and never re-run", async () => {
    const tools = fakeTools({
      create_draft_entry: { write: true, run: () => ({ ok: true, summary: "Created", data: { uid: "api::news.news", id: "d1" } }) },
      search_content: { run: () => ({ ok: true, summary: "Found 1", data: [{ uid: "api::news.news", id: "d1" }] }) },
    });
    const store = memoryStore({ crashOn: { at: "pre_write", nth: 1 } });
    const chat = scriptedChat([
      { reply: replyTools([toolCall("create_draft_entry", { title: "A" }, "w1")]) },
      {
        expect: (req) => {
          const t = toolResult(req, "w1");
          assert.equal(t.ok, false);
          assert.equal(t.summary, OUTCOME_UNKNOWN);
        },
        reply: replyTools([toolCall("search_content", { q: "A" }, "s1")]),
      },
      { reply: replyText("The draft already exists.") },
    ]);

    await assert.rejects(runSlice(newRun(), depsFor(chat, tools.tools, { save: store.save }).deps, LIMITS), SimulatedCrash);
    const crashed = store.last();
    assert.ok(crashed);
    assert.equal(crashed.inflight?.pendingWrite, "w1");

    const resumed = await runSlice(crashed, depsFor(chat, tools.tools).deps, LIMITS);
    chat.assertClean();
    assert.equal(resumed.stop, "text");
    assert.equal(tools.calls.filter((c) => c.name === "create_draft_entry").length, 0);
    assert.equal(resumed.checkpoint.inflight, undefined);
  });

  test("many one-turn slices end in the same state as one continuous run", async () => {
    const script = () => [
      { reply: replyTools([toolCall("create_draft_entry", { n: 1 }, "c1"), toolCall("create_draft_entry", { n: 2 }, "c2")]) },
      { reply: replyTools([toolCall("get_entry", { id: "d1" }, "c3")]) },
      { reply: replyTools([toolCall("create_draft_entry", { n: 3 }, "c4")]) },
      { reply: replyText("Three drafts created.") },
    ];
    const registry = () =>
      fakeTools({
        create_draft_entry: { write: true, run: (a) => ({ ok: true, summary: `Created ${a.n}`, data: { uid: "api::news.news", id: `d${a.n}` } }) },
        get_entry: { run: (a) => ({ ok: true, summary: "Loaded", data: { id: a.id } }) },
      });

    const oneChat = scriptedChat(script());
    const oneTools = registry();
    const one = await runSlice(newRun(), depsFor(oneChat, oneTools.tools).deps, LIMITS);
    oneChat.assertClean();

    const manyChat = scriptedChat(script());
    const manyTools = registry();
    let cp = newRun();
    let stop = "";
    let slices = 0;
    do {
      const r = await runSlice(cp, depsFor(manyChat, manyTools.tools).deps, { ...LIMITS, maxTurns: 1 });
      const saved = parseCheckpoint(JSON.stringify(r.checkpoint));
      assert.ok(saved);
      cp = saved;
      stop = r.stop;
      slices++;
    } while (stop === "slice_end" && slices < 10);
    manyChat.assertClean();

    assert.equal(one.stop, "text");
    assert.equal(stop, "text");
    assert.equal(slices, 4);
    assert.deepEqual(cp, JSON.parse(JSON.stringify(one.checkpoint)));
    assert.deepEqual(manyTools.calls, oneTools.calls);
  });
});

describe("other stops", () => {
  test("losing every tool mid-run ends with a policy stop", async () => {
    const box = { hide: () => {} };
    const tools = fakeTools({
      get_entry: {
        run: () => {
          box.hide();
          return { ok: true, summary: "Loaded" };
        },
      },
    });
    box.hide = tools.hide;
    const chat = scriptedChat([{ reply: replyTools([toolCall("get_entry", {}, "c1")]) }]);
    const r = await runSlice(newRun(), depsFor(chat, tools.tools).deps, LIMITS);

    chat.assertClean();
    assert.equal(r.stop, "policy");
    assert.equal(chat.requests.length, 1);
  });

  test("stopping mid-batch answers the remaining calls without running them", async () => {
    const ac = new AbortController();
    const tools = fakeTools({
      get_entry: {
        run: () => {
          ac.abort();
          return { ok: true, summary: "Loaded" };
        },
      },
    });
    const chat = scriptedChat([{ reply: replyTools([toolCall("get_entry", {}, "a"), toolCall("get_entry", {}, "b"), toolCall("get_entry", {}, "c")]) }]);
    const { deps, events } = depsFor(chat, tools.tools);
    const r = await runSlice(newRun(), deps, LIMITS, ac.signal);

    assert.equal(r.stop, "aborted");
    assert.equal(tools.calls.length, 1);
    assert.deepEqual(exchanges(r.checkpoint)[0].results.map((x) => x.executed), [true, false, false]);
    assert.equal(r.checkpoint.inflight, undefined);
    assert.equal(stoppedEvents(events).length, 0);
  });

  test("a failed model call ends the run with an error event and no Continue", async () => {
    const chat = scriptedChat([{ throws: new LlmError("LLM_HTTP_401: bad key", { status: 401, kind: "auth" }) }]);
    const { deps, events } = depsFor(chat, fakeTools({}).tools);
    const r = await runSlice(newRun(), deps, LIMITS);

    assert.equal(r.stop, "llm_error");
    assert.ok(events.some((e) => e.type === "error"));
    assert.equal(stoppedEvents(events).length, 0);
  });
});

describe("checkpoint helpers", () => {
  test("startRun drops a leading assistant turn and keeps the text history", () => {
    const cp = startRun({
      runId: "r", threadId: "t", mode: "docked", lang: "th", ref: { kind: "none" }, model: "webx-kimi",
      priorText: [{ role: "assistant", content: "Hello" }, { role: "user", content: "Q1" }, { role: "assistant", content: "A1" }],
      message: "Q2",
    });
    assert.deepEqual(cp.history.map((h) => h.kind), ["user", "assistant_text", "user"]);
  });

  test("startRun/applyInput attach an image to the user turn, and buildWireMessages sends it as an image_url content block", () => {
    const cp = startRun({
      runId: "r", threadId: "t", mode: "docked", lang: "en", ref: { kind: "none" }, model: "webx-default",
      message: "what's on this page?", image: "data:image/png;base64,AAAA",
    });
    assert.equal(cp.history[0].kind, "user");
    assert.equal((cp.history[0] as any).image, "data:image/png;base64,AAAA");

    const wire = buildWireMessages(cp, { system: "sys", targetModel: "webx-default", digestAfterBytes: LIMITS.digestAfterBytes });
    const userMsg = wire.find((m) => m.role === "user");
    assert.ok(Array.isArray(userMsg?.content));
    const content = userMsg!.content as any[];
    assert.deepEqual(content, [
      { type: "text", text: "what's on this page?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);

    const next = applyInput(cp, { kind: "message", text: "and this one?", image: "data:image/png;base64,BBBB" });
    const added: any = next.history[next.history.length - 1];
    assert.equal(added.image, "data:image/png;base64,BBBB");
  });

  test("fitCheckpoint keeps only the most recent user turn's image, dropping older ones first", () => {
    const cp = newRun();
    cp.history.unshift({ kind: "user", text: "first", image: "data:image/png;base64," + "A".repeat(5_000) });
    (cp.history[cp.history.length - 1] as any).image = "data:image/png;base64," + "B".repeat(5_000);
    const max = 7 * 1024;
    assert.equal(byteLen(JSON.stringify(cp)) > max, true, "sanity: the unfitted checkpoint (two images) is actually oversized");
    const fitted = fitCheckpoint(cp, max, { stripReasoning: true });
    assert.ok(fitted, "one image alone should still fit");
    const withImage = fitted!.history.filter((h: any) => h.kind === "user" && h.image);
    assert.equal(withImage.length, 1);
    assert.ok((withImage[0] as any).image.includes("BB"), "the LAST turn's image survives, not the first");
  });

  test("applyInput refuses while a tool batch is in flight", () => {
    const cp = newRun();
    cp.inflight = { exchangeIndex: 0, done: [] };
    assert.throws(() => applyInput(cp, { kind: "message", text: "More" }));
  });

  test("parseCheckpoint rejects other versions and malformed input", () => {
    assert.equal(parseCheckpoint("{not json"), null);
    assert.equal(parseCheckpoint({ ...newRun(), v: 2 }), null);
    assert.equal(parseCheckpoint(null), null);
    assert.ok(parseCheckpoint(JSON.stringify(newRun())));
  });

  test("fitCheckpoint trades old tool results for digests before giving up", () => {
    const cp = newRun();
    for (let i = 0; i < 5; i++) {
      const id = `c${i}`;
      cp.history.push({
        kind: "exchange", text: null, reasoning: { content: "why", servedBy: "webx-kimi" },
        calls: [toolCall("get_entry", { id }, id)],
        results: [toolResultRecord(id, "get_entry", { ok: true, summary: "Loaded", data: { uid: "api::news.news", id: `doc-${i}`, body: "ข่าว".repeat(2000) } }, true, LIMITS)],
      });
    }
    const max = 8 * 1024;
    const fitted = fitCheckpoint(cp, max, { stripReasoning: true });
    assert.ok(fitted);
    assert.ok(byteLen(JSON.stringify(fitted)) <= max);
    for (const h of exchanges(fitted)) {
      assert.equal(h.reasoning, undefined);
      assert.ok(h.results[0].full.includes("doc-"));
    }
    assert.equal(fitCheckpoint(cp, 200), null);
    assert.notEqual(exchanges(cp)[0].results[0].full, exchanges(cp)[0].results[0].digest, "the input is not modified");
  });
});

describe("toolView.boundedJson", () => {
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  test("always returns valid JSON within the byte limit", () => {
    const rand = rng(42);
    const words = ["ข่าว", "news", "บริการ", "😀", '"quoted"', "a\\b", "\n"];
    const gen = (depth: number): unknown => {
      const r = rand();
      if (depth > 3 || r < 0.35) return words[Math.floor(rand() * words.length)].repeat(1 + Math.floor(rand() * 60));
      if (r < 0.65) return Array.from({ length: Math.floor(rand() * 8) }, () => gen(depth + 1));
      return Object.fromEntries(Array.from({ length: Math.floor(rand() * 6) }, (_, i) => [`k${i}`, gen(depth + 1)]));
    };
    for (let i = 0; i < 80; i++) {
      const value = gen(0);
      for (const max of [64, 300, 2048, 6144]) {
        const s = boundedJson(value, max);
        assert.ok(byteLen(s) <= max, `case ${i}: ${byteLen(s)} bytes > ${max}`);
        assert.doesNotThrow(() => JSON.parse(s), `case ${i} at ${max} bytes`);
      }
    }
  });
});
