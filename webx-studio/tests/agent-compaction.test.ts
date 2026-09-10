// History compaction (lib/agent/engine/compaction.ts), including a property
// test over randomly generated histories.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildWireMessages, startRun } from "../lib/agent/engine/checkpoint";
import { calibrateRatio, compactHistory, estimateTokens, PROGRESS_HEADER } from "../lib/agent/engine/compaction";
import { checkProtocol } from "../lib/agent/engine/invariants";
import { limitsFor } from "../lib/agent/engine/limits";
import { toolResultRecord } from "../lib/agent/engine/toolView";
import type { ExchangeItem, RunCheckpoint } from "../lib/agent/engine/types";
import { fakeTools } from "./harness/fakeTools";
import { toolCall } from "./harness/scriptedChat";

const LIMITS = limitsFor("docked");
const SPECS = fakeTools({ get_entry: { run: () => ({ ok: true, summary: "Loaded" }) } }).tools.specs();

function newRun(model = "webx-local", message = "Create the drafts for the new services section"): RunCheckpoint {
  return startRun({ runId: "r", threadId: "t", mode: "job", lang: "en", ref: { kind: "none" }, model, message });
}

function addExchange(cp: RunCheckpoint, n: number, bodyChars: number): void {
  const id = `c${n}`;
  cp.history.push({
    kind: "exchange", text: null, calls: [toolCall("get_entry", { id: `e${n}` }, id)],
    results: [toolResultRecord(id, "get_entry", { ok: true, summary: `Loaded ${n}`, data: { uid: "api::news.news", id: `doc-${n}`, body: "x".repeat(bodyChars) } }, true, LIMITS)],
  });
}

const wire = (cp: RunCheckpoint) => buildWireMessages(cp, { system: "sys", targetModel: cp.model, digestAfterBytes: LIMITS.digestAfterBytes });
const protocolErrors = (cp: RunCheckpoint) => checkProtocol(wire(cp), { toolsSent: true }).filter((v) => v.severity === "error");

describe("token estimate", () => {
  test("uses the calibrated ratio with a safety margin", () => {
    assert.equal(estimateTokens(1000), 330);
    assert.equal(estimateTokens(1000, 0.5), 550);
  });

  test("calibration moves toward what the provider reported and ignores empty usage", () => {
    assert.equal(calibrateRatio(undefined, 250, 1000), 0.25);
    assert.equal(calibrateRatio(0.25, 500, 1000), 0.25 * 0.7 + 0.5 * 0.3);
    assert.equal(calibrateRatio(0.25, 0, 1000), 0.25);
  });
});

describe("compactHistory", () => {
  test("leaves a history under the threshold untouched", () => {
    const cp = newRun("webx-kimi");
    for (let i = 0; i < 5; i++) addExchange(cp, i, 1000);
    const before = structuredClone(cp);
    const c = compactHistory(cp, { system: "sys", specs: SPECS, limits: LIMITS });
    assert.equal(c.changed, false);
    assert.deepEqual(cp, before);
  });

  test("folds old items into a pinned goal and progress that keep the ids", () => {
    // Old results already go out as digests once history is large, so it takes
    // many exchanges, not a few big ones, to pass the threshold.
    const cp = newRun();
    for (let i = 0; i < 200; i++) addExchange(cp, i, 5000);
    const c = compactHistory(cp, { system: "sys", specs: SPECS, limits: LIMITS });

    assert.equal(c.changed, true);
    assert.ok(c.folded > 0);
    assert.ok(c.afterTokens < c.beforeTokens);
    assert.equal(cp.pinned?.goal, "Create the drafts for the new services section");
    assert.ok(cp.pinned?.progress?.startsWith(PROGRESS_HEADER));
    const kept = cp.history.filter((h): h is ExchangeItem => h.kind === "exchange").map((h) => Number(h.calls[0].id.slice(1)));
    assert.deepEqual(kept.slice(-2), [198, 199]);
    const lastFolded = kept[0] - 1;
    assert.ok(
      cp.pinned!.progress!.includes(`get_entry({"id":"e${lastFolded}"}) → ok: Loaded ${lastFolded} [api::news.news doc-${lastFolded}]`),
      "the most recently folded step is in the progress message with its id",
    );
    assert.deepEqual(protocolErrors(cp), []);
    const last = cp.history[cp.history.length - 1] as ExchangeItem;
    assert.notEqual(last.results[0].full, last.results[0].digest, "the newest results stay full");
  });

  test("aggressive compaction keeps only the latest exchange", () => {
    const cp = newRun();
    for (let i = 0; i < 6; i++) addExchange(cp, i, 3000);
    const c = compactHistory(cp, { system: "sys", specs: SPECS, limits: LIMITS, aggressive: true });
    assert.equal(c.changed, true);
    const exchanges = cp.history.filter((h): h is ExchangeItem => h.kind === "exchange");
    assert.equal(exchanges[exchanges.length - 1].calls[0].id, "c5");
    for (const h of exchanges.slice(0, -1)) assert.equal(h.results[0].full, h.results[0].digest);
    assert.deepEqual(protocolErrors(cp), []);
  });

  test("never runs while a tool batch is in flight", () => {
    const cp = newRun();
    for (let i = 0; i < 40; i++) addExchange(cp, i, 5000);
    cp.inflight = { exchangeIndex: cp.history.length - 1, done: [] };
    assert.equal(compactHistory(cp, { system: "sys", specs: SPECS, limits: LIMITS }).changed, false);
  });

  test("keeps a pinned message even when everything folded had nothing to say", () => {
    const cp = newRun("webx-local", "   ");
    for (let i = 0; i < 40; i++) {
      const id = `n${i}`;
      cp.history.push({
        kind: "exchange", text: null, calls: [toolCall("get_entry", {}, id)],
        results: [toolResultRecord(id, "get_entry", { ok: false, summary: "Not executed: limit " + "x".repeat(6000) }, false, LIMITS)],
      });
    }
    compactHistory(cp, { system: "sys", specs: SPECS, limits: LIMITS, aggressive: true });
    assert.deepEqual(protocolErrors(cp), []);
  });
});

describe("compaction property", () => {
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomRun(rand: () => number): RunCheckpoint {
    const cp = newRun("webx-local", "Goal " + "g".repeat(Math.floor(rand() * 400)));
    let calls = 0;
    const items = 4 + Math.floor(rand() * 24);
    for (let i = 0; i < items; i++) {
      const r = rand();
      if (r < 0.1) cp.history.push({ kind: "user", text: "Also " + "u".repeat(Math.floor(rand() * 300)) });
      else if (r < 0.2) cp.history.push({ kind: "assistant_text", text: "Note " + "a".repeat(Math.floor(rand() * 300)) });
      else {
        const exchange: ExchangeItem = { kind: "exchange", text: rand() < 0.3 ? "Working on it" : null, calls: [], results: [] };
        const n = 1 + Math.floor(rand() * 3);
        for (let j = 0; j < n; j++) {
          const id = `c${++calls}`;
          exchange.calls.push(toolCall("get_entry", { id: `e${calls}` }, id));
          const executed = rand() > 0.15;
          const outcome = executed
            ? { ok: rand() > 0.2, summary: `Loaded ${calls}`, data: { uid: "api::news.news", id: `doc-${calls}`, body: "ข่าว".repeat(Math.floor(rand() * 1500)) } }
            : { ok: false, summary: "Not executed: at most 6 tool calls run per turn." };
          exchange.results.push(toolResultRecord(id, "get_entry", outcome, executed, LIMITS));
        }
        cp.history.push(exchange);
      }
    }
    return cp;
  }

  test("500 random histories: protocol intact, latest exchange whole, folded ids kept", () => {
    const rand = rng(20260911);
    let compacted = 0;
    for (let i = 0; i < 500; i++) {
      const cp = randomRun(rand);
      const before = structuredClone(cp);
      const aggressive = rand() < 0.2;
      const c = compactHistory(cp, { system: "sys", specs: SPECS, limits: LIMITS, aggressive });
      if (c.changed) compacted++;

      assert.deepEqual(protocolErrors(cp), [], `case ${i}: protocol`);
      for (const h of cp.history) {
        if (h.kind !== "exchange") continue;
        for (const call of h.calls) assert.ok(h.results.some((r) => r.callId === call.id), `case ${i}: ${call.id} lost its result`);
      }

      const latest = [...before.history].reverse().find((h): h is ExchangeItem => h.kind === "exchange");
      if (latest) {
        const kept = cp.history.find((h): h is ExchangeItem => h.kind === "exchange" && h.calls[0].id === latest.calls[0].id);
        assert.ok(kept, `case ${i}: latest exchange folded`);
        assert.deepEqual(kept.results, latest.results, `case ${i}: latest exchange changed`);
      }

      const progress = cp.pinned?.progress || "";
      if (c.folded && !/earlier steps? omitted/.test(progress)) {
        const keptIds = new Set(cp.history.flatMap((h) => (h.kind === "exchange" ? h.calls.map((x) => x.id) : [])));
        for (const h of before.history) {
          if (h.kind !== "exchange" || keptIds.has(h.calls[0].id)) continue;
          for (const r of h.results) {
            if (!r.executed) continue;
            for (const ref of JSON.parse(r.digest).ids) assert.ok(progress.includes(`${ref.id}]`) || progress.includes(`${ref.id},`), `case ${i}: lost ${ref.id}`);
          }
        }
      }
      if (c.changed && !c.overLimit) assert.ok(c.afterTokens <= c.beforeTokens, `case ${i}: grew`);
    }
    assert.ok(compacted > 50, `only ${compacted} of 500 cases compacted — the generator no longer exercises compaction`);
  });
});
