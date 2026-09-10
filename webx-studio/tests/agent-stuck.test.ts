// Stuck detection (lib/agent/engine/stuck.ts).
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { startRun } from "../lib/agent/engine/checkpoint";
import { callSignature, errorKey, observeCall, observeTurn } from "../lib/agent/engine/stuck";
import type { RunCheckpoint, RunMode } from "../lib/agent/engine/types";

const newRun = (mode: RunMode = "docked"): RunCheckpoint =>
  startRun({ runId: "r", threadId: "t", mode, lang: "en", ref: { kind: "none" }, model: "webx-kimi", message: "Go" });

const call = (cp: RunCheckpoint, turn: number, name: string, args: Record<string, unknown>, ok: boolean, summary = ok ? "ok" : "failed") =>
  observeCall(cp, { turn, name, args: JSON.stringify(args), ok, summary });

const invalidUid = (uid: string) => `"${uid}" is not a valid content-type uid. Use the EXACT "uid" string a prior list_content_types call returned.`;

describe("errorKey and callSignature", () => {
  test("errors that differ only in quoted values or numbers share a key", () => {
    assert.equal(errorKey(invalidUid("page")), errorKey(invalidUid("site_page")));
    assert.equal(errorKey("No block at index 3 (page has 2)."), errorKey("No block at index 9 (page has 14)."));
    assert.notEqual(errorKey("create failed: title must be defined."), errorKey("create failed: Not Found"));
  });

  test("argument order does not change a call's signature, argument values do", () => {
    assert.equal(callSignature("get_entry", '{"uid":"api::news.news","id":"1"}'), callSignature("get_entry", '{"id":"1","uid":"api::news.news"}'));
    assert.notEqual(callSignature("get_entry", '{"id":"1"}'), callSignature("get_entry", '{"id":"2"}'));
  });
});

describe("observeCall", () => {
  test("the same failing call three times is a repeat", () => {
    const cp = newRun();
    assert.equal(call(cp, 1, "get_entry", { id: "x" }, false, "Entry not found"), null);
    assert.equal(call(cp, 2, "get_entry", { id: "x" }, false, "Entry not found"), null);
    assert.equal(call(cp, 3, "get_entry", { id: "x" }, false, "Entry not found")?.kind, "repeat_call");
  });

  test("different guesses failing with the same error are a repeat (bug 1)", () => {
    const cp = newRun();
    call(cp, 1, "search_content", { uid: "page" }, false, invalidUid("page"));
    call(cp, 2, "search_content", { uid: "pages" }, false, invalidUid("pages"));
    const hit = call(cp, 3, "search_content", { uid: "site_page" }, false, invalidUid("site_page"));
    assert.equal(hit?.kind, "repeat_error");
    assert.match(hit!.note, /get_content_type_schema/);
    assert.match(hit!.detail, /^search_content: /);
  });

  test("six unrelated failures in a row are a streak", () => {
    const cp = newRun();
    for (let i = 0; i < 5; i++) assert.equal(call(cp, i + 1, `tool_${i}`, {}, false, `error number ${"abcde"[i]}`), null);
    assert.equal(call(cp, 6, "tool_5", {}, false, "yet another error")?.kind, "failing_streak");
  });

  test("two calls alternating three times each", () => {
    const cp = newRun();
    const a = { uid: "api::page.page", id: "1" };
    for (let i = 0; i < 5; i++) assert.equal(call(cp, i + 1, i % 2 ? "get_page_blocks" : "get_entry", a, true), null);
    assert.equal(call(cp, 6, "get_page_blocks", a, true)?.kind, "alternating");
  });

  test("varied successful work is never stuck", () => {
    const cp = newRun();
    for (let i = 0; i < 20; i++) assert.equal(call(cp, i + 1, "create_draft_entry", { title: `Entry ${i}` }, true), null);
  });

  test("after a note, only later activity counts", () => {
    const cp = newRun();
    for (let t = 1; t <= 3; t++) call(cp, t, "get_entry", { id: "x" }, false, "Entry not found");
    cp.stuck!.noted = { turn: 3, kind: "repeat_call" };
    assert.equal(call(cp, 4, "get_entry", { id: "x" }, false, "Entry not found"), null);
    assert.equal(call(cp, 5, "get_entry", { id: "x" }, false, "Entry not found"), null);
    assert.equal(call(cp, 6, "get_entry", { id: "x" }, false, "Entry not found")?.kind, "repeat_call");
  });
});

describe("observeTurn", () => {
  test("four read-only turns are reconnaissance in a job, not in chat", () => {
    const chat = newRun("docked");
    const job = newRun("job");
    for (let t = 1; t <= 3; t++) {
      assert.equal(observeTurn(chat, { turn: t, progressed: false, readOnly: true }, "docked"), null);
      assert.equal(observeTurn(job, { turn: t, progressed: false, readOnly: true }, "job"), null);
    }
    assert.equal(observeTurn(chat, { turn: 4, progressed: false, readOnly: true }, "docked"), null);
    assert.equal(observeTurn(job, { turn: 4, progressed: false, readOnly: true }, "job")?.kind, "reconnaissance");
  });

  test("a turn that wrote something resets the count", () => {
    const job = newRun("job");
    observeTurn(job, { turn: 1, progressed: false, readOnly: true }, "job");
    observeTurn(job, { turn: 2, progressed: false, readOnly: true }, "job");
    observeTurn(job, { turn: 3, progressed: true, readOnly: false }, "job");
    observeTurn(job, { turn: 4, progressed: false, readOnly: true }, "job");
    assert.equal(observeTurn(job, { turn: 5, progressed: false, readOnly: true }, "job"), null);
  });
});
