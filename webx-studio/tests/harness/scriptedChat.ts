// A scripted stand-in for the LLM. Every request is checked against the
// provider protocol invariants first; a violation fails the request with a
// provider-style 400, which is exactly how bug 3 (unanswered tool calls)
// failed against Kimi live.
import { LlmError } from "../../lib/agent/engine/errors";
import { checkProtocol, type ProtocolViolation } from "../../lib/agent/engine/invariants";
import type { ChatReply, ChatRequest, ToolCall } from "../../lib/agent/engine/types";

export type ScriptStep =
  | { expect?: (req: ChatRequest) => void; reply: ChatReply | ((req: ChatRequest) => ChatReply) }
  | { throws: Error };

export type ScriptedChat = {
  chat: (req: ChatRequest) => Promise<ChatReply>;
  /** Every request received, without its abort signal. */
  requests: Omit<ChatRequest, "signal">[];
  violations: { request: number; violations: ProtocolViolation[] }[];
  remaining: () => number;
  /** Rethrows the first failed `expect` or protocol violation. The engine turns
   * a failed model call into an `llm_error` stop, so call this before asserting
   * on the stop reason to see the real cause. */
  assertClean: () => void;
};

export function scriptedChat(steps: ScriptStep[]): ScriptedChat {
  const requests: Omit<ChatRequest, "signal">[] = [];
  const violations: ScriptedChat["violations"] = [];
  const failures: unknown[] = [];
  let next = 0;

  return {
    requests,
    violations,
    remaining: () => steps.length - next,
    assertClean() {
      if (failures.length) throw failures[0];
      if (violations.length) throw new Error("Protocol violations: " + JSON.stringify(violations));
    },
    async chat(req) {
      const { signal: _signal, ...rest } = req;
      requests.push(structuredClone(rest));
      const index = requests.length - 1;

      const errors = checkProtocol(req.messages, { toolsSent: Boolean(req.tools?.length) }).filter((v) => v.severity === "error");
      if (errors.length) {
        violations.push({ request: index, violations: errors });
        throw new LlmError("Invalid request: " + errors.map((e) => e.code).join(", "), { status: 400, kind: "bad_request" });
      }

      const step = steps[next++];
      if (!step) {
        const e = new Error(`scriptedChat: no scripted reply for request #${index}`);
        failures.push(e);
        throw e;
      }
      if ("throws" in step) throw step.throws;
      try {
        step.expect?.(req);
      } catch (e) {
        failures.push(e);
        throw e;
      }
      return typeof step.reply === "function" ? step.reply(req) : structuredClone(step.reply);
    },
  };
}

let callSeq = 0;

export function toolCall(name: string, args: Record<string, unknown> = {}, id = `call_${name}_${++callSeq}`): ToolCall {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

type ReplyOpts = { reasoning?: string; thinkingBlocks?: unknown[]; model?: string };

function extras(o: ReplyOpts) {
  return {
    ...(o.reasoning ? { reasoning_content: o.reasoning } : {}),
    ...(o.thinkingBlocks ? { thinking_blocks: o.thinkingBlocks } : {}),
  };
}

export function replyTools(calls: ToolCall[], o: ReplyOpts & { text?: string } = {}): ChatReply {
  return {
    message: { content: o.text ?? null, tool_calls: calls, ...extras(o) },
    usage: { prompt_tokens: 100, completion_tokens: 20 },
    finishReason: "tool_calls",
    ...(o.model ? { model: o.model } : {}),
  };
}

export function replyText(text: string, o: ReplyOpts = {}): ChatReply {
  return {
    message: { content: text, ...extras(o) },
    usage: { prompt_tokens: 100, completion_tokens: 20 },
    finishReason: "stop",
    ...(o.model ? { model: o.model } : {}),
  };
}
