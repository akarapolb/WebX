// Provider protocol invariants (lib/agent/engine/invariants.ts). These are
// the structural rules every OpenAI-compatible provider enforces on a
// tool-calling conversation; the engine checks them before every request.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { assertProtocol, checkProtocol, ProtocolError, repairHistory, type ProtocolOptions } from "../lib/agent/engine/invariants";
import type { WireMsg } from "../lib/agent/engine/types";

const call = (id: string, args = "{}") => ({ id, type: "function" as const, function: { name: "get_entry", arguments: args } });
const sys: WireMsg = { role: "system", content: "sys" };
const user = (text = "hi"): WireMsg => ({ role: "user", content: text });
const tool = (id: string, content = '{"ok":true}'): WireMsg => ({ role: "tool", tool_call_id: id, name: "get_entry", content });
const assistantCalls = (...ids: string[]): WireMsg => ({ role: "assistant", content: null, tool_calls: ids.map((id) => call(id)) });
const done: WireMsg = { role: "assistant", content: "Done" };

const codes = (messages: WireMsg[], opts: ProtocolOptions = {}) =>
  checkProtocol(messages, { toolsSent: true, ...opts }).filter((v) => v.severity === "error").map((v) => v.code);

describe("checkProtocol", () => {
  test("a well-formed tool conversation has no errors", () => {
    assert.deepEqual(codes([sys, user(), assistantCalls("a", "b"), tool("a"), tool("b"), done]), []);
  });

  test("a call without a tool reply is reported (bug 3's provider 400)", () => {
    assert.deepEqual(codes([sys, user(), assistantCalls("a", "b"), tool("a")]), ["unanswered_tool_call"]);
  });

  test("tool messages that answer nothing are orphans", () => {
    assert.deepEqual(codes([sys, user(), tool("x")]), ["orphan_tool_message"]);
    assert.deepEqual(codes([sys, user(), assistantCalls("a"), tool("a"), tool("zzz")]), ["orphan_tool_message"]);
  });

  test("a call id may appear only once in the conversation", () => {
    assert.deepEqual(codes([sys, user(), assistantCalls("a"), tool("a"), assistantCalls("a"), tool("a")]), ["duplicate_tool_call_id"]);
  });

  test("arguments must parse to a JSON object", () => {
    const bad: WireMsg = { role: "assistant", content: null, tool_calls: [call("a", "[1]")] };
    assert.deepEqual(codes([sys, user(), bad, tool("a")]), ["arguments_not_object"]);
  });

  test("tool content must be JSON, within the size cap", () => {
    assert.deepEqual(codes([sys, user(), assistantCalls("a"), tool("a", "not json")]), ["tool_content_not_json"]);
    const big = tool("a", JSON.stringify({ s: "x".repeat(100) }));
    assert.deepEqual(codes([sys, user(), assistantCalls("a"), big], { maxToolContentBytes: 50 }), ["tool_content_too_large"]);
  });

  test("tool calls in history need tools on the request", () => {
    assert.deepEqual(codes([sys, user(), assistantCalls("a"), tool("a")], { toolsSent: false }), ["tools_missing"]);
  });

  test("the system message comes first and a user message follows it", () => {
    assert.deepEqual(codes([user(), sys]), ["system_position", "system_position", "user_after_system"]);
    assert.deepEqual(codes([sys, done]), ["user_after_system"]);
  });

  test("an assistant message needs content or tool calls", () => {
    assert.deepEqual(codes([sys, user(), { role: "assistant", content: "  " }]), ["empty_assistant"]);
  });

  test("consecutive user messages are only a warning", () => {
    const v = checkProtocol([sys, user("a"), user("b")], { toolsSent: false });
    assert.deepEqual(v.map((x) => [x.code, x.severity]), [["consecutive_user", "warn"]]);
  });
});

describe("assertProtocol", () => {
  test("throws a ProtocolError that lists the violations", () => {
    assert.throws(
      () => assertProtocol([sys, user(), assistantCalls("a")], { toolsSent: true }),
      (e: unknown) => e instanceof ProtocolError && e.violations[0].code === "unanswered_tool_call",
    );
  });
});

describe("repairHistory", () => {
  test("answers missing calls, drops orphans and empty turns, merges users — and the result passes", () => {
    const broken: WireMsg[] = [
      sys, user("a"), user("b"), tool("orphan"), assistantCalls("a", "b"), tool("a"), tool("zzz"), { role: "assistant", content: "" }, user("c"),
    ];
    const { messages, repairs } = repairHistory(broken);
    assert.ok(repairs > 0);
    assert.deepEqual(codes(messages), []);
    assert.deepEqual(messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id), ["a", "b"]);
    assert.equal(messages[1].content, "a\n\nb");
  });

  test("an intact history comes back unchanged", () => {
    const intact: WireMsg[] = [sys, user(), assistantCalls("a"), tool("a"), done];
    const { messages, repairs } = repairHistory(intact);
    assert.equal(repairs, 0);
    assert.deepEqual(messages, intact);
  });
});
