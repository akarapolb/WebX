// Structural rules every provider enforces on a tool-calling conversation.
// Checked before each send: tests throw on a violation, production repairs
// the history and counts it.
import { byteLen } from "./toolView";
import type { WireMsg } from "./types";

export type ProtocolViolation = { code: string; index: number; severity: "error" | "warn"; detail: string };

export type ProtocolOptions = {
  toolsSent?: boolean;
  toolNames?: readonly string[];
  maxToolContentBytes?: number;
  expectReasoningEcho?: boolean;
};

export class ProtocolError extends Error {
  readonly violations: ProtocolViolation[];
  constructor(violations: ProtocolViolation[]) {
    super("Protocol violation: " + violations.map((v) => `${v.code}@${v.index}`).join(", "));
    this.name = "ProtocolError";
    this.violations = violations;
  }
}

function contentText(m: WireMsg): string {
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) return m.content.map((b) => b.text).join("");
  return "";
}

function isObjectJson(s: unknown): boolean {
  if (typeof s !== "string") return false;
  try {
    const v = JSON.parse(s);
    return Boolean(v) && typeof v === "object" && !Array.isArray(v);
  } catch {
    return false;
  }
}

function isJson(s: unknown): boolean {
  if (typeof s !== "string") return false;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

export function checkProtocol(messages: WireMsg[], opts: ProtocolOptions = {}): ProtocolViolation[] {
  const out: ProtocolViolation[] = [];
  const add = (code: string, index: number, detail: string, severity: "error" | "warn" = "error") => out.push({ code, index, severity, detail });

  if (!messages.length) {
    add("empty", -1, "no messages");
    return out;
  }
  if (messages[0].role !== "system") add("system_position", 0, "first message must be the system message");
  messages.forEach((m, i) => {
    if (i > 0 && m.role === "system") add("system_position", i, "only one system message, at index 0");
  });
  if (messages.length > 1 && messages[1].role !== "user") add("user_after_system", 1, "the first message after system must be a user message");

  const seenIds = new Set<string>();
  let hasToolCalls = false;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "user" && i > 0 && messages[i - 1].role === "user") add("consecutive_user", i, "two user messages in a row", "warn");
    if (m.role === "tool") {
      add("orphan_tool_message", i, String(m.tool_call_id));
      continue;
    }
    if (m.role !== "assistant") continue;

    const calls = m.tool_calls || [];
    if (!calls.length) {
      if (!contentText(m).trim()) add("empty_assistant", i, "assistant message has neither content nor tool calls");
      continue;
    }

    hasToolCalls = true;
    if (opts.expectReasoningEcho && !m.reasoning_content && !m.thinking_blocks?.length) {
      add("reasoning_missing", i, "tool-call message has no reasoning to echo", "warn");
    }
    const pending = new Set<string>();
    for (const c of calls) {
      if (!c || typeof c.id !== "string" || !c.id) {
        add("tool_call_id_missing", i, "tool call without an id");
        continue;
      }
      if (seenIds.has(c.id)) add("duplicate_tool_call_id", i, c.id);
      seenIds.add(c.id);
      pending.add(c.id);
      const name = c.function?.name;
      if (!name) add("tool_name_missing", i, c.id);
      else if (opts.toolNames && !opts.toolNames.includes(name)) add("unknown_tool", i, name, "warn");
      if (!isObjectJson(c.function?.arguments)) add("arguments_not_object", i, c.id);
    }

    let j = i + 1;
    while (j < messages.length && messages[j].role === "tool") {
      const t = messages[j];
      if (!t.tool_call_id || !pending.has(t.tool_call_id)) add("orphan_tool_message", j, String(t.tool_call_id));
      else pending.delete(t.tool_call_id);
      if (!isJson(t.content)) add("tool_content_not_json", j, String(t.tool_call_id));
      else if (opts.maxToolContentBytes && byteLen(t.content as string) > opts.maxToolContentBytes) add("tool_content_too_large", j, String(t.tool_call_id));
      j++;
    }
    for (const id of pending) add("unanswered_tool_call", i, id);
    i = j - 1;
  }

  if (hasToolCalls && opts.toolsSent === false) add("tools_missing", -1, "history contains tool calls but no tools were sent");
  return out;
}

export function assertProtocol(messages: WireMsg[], opts: ProtocolOptions = {}): void {
  const errors = checkProtocol(messages, opts).filter((v) => v.severity === "error");
  if (errors.length) throw new ProtocolError(errors);
}

const MISSING_RESULT = JSON.stringify({ ok: false, summary: "No result was recorded for this call." });

export function repairHistory(messages: WireMsg[]): { messages: WireMsg[]; repairs: number } {
  let repairs = 0;
  const out: WireMsg[] = [];
  const systems = messages.filter((m) => m.role === "system");
  if (systems.length) out.push(systems[0]);
  if (systems.length > 1 || (systems.length === 1 && messages[0].role !== "system")) repairs++;

  const rest = messages.filter((m) => m.role !== "system");
  const seen = new Set<string>();

  for (let i = 0; i < rest.length; i++) {
    const m = rest[i];
    if (m.role === "tool") {
      repairs++;
      continue;
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      const calls = m.tool_calls
        .filter((c) => c && typeof c.id === "string" && c.id && !seen.has(c.id))
        .map((c) => {
          if (isObjectJson(c.function?.arguments)) return c;
          repairs++;
          return { ...c, function: { name: c.function?.name || "unknown", arguments: "{}" } };
        });
      if (calls.length !== m.tool_calls.length) repairs++;
      calls.forEach((c) => seen.add(c.id));

      const answers = new Map<string, WireMsg>();
      let j = i + 1;
      while (j < rest.length && rest[j].role === "tool") {
        const t = rest[j];
        if (t.tool_call_id && !answers.has(t.tool_call_id) && calls.some((c) => c.id === t.tool_call_id)) answers.set(t.tool_call_id, t);
        else repairs++;
        j++;
      }
      i = j - 1;

      if (!calls.length) {
        const text = contentText(m);
        if (text.trim()) out.push({ role: "assistant", content: text });
        continue;
      }
      out.push({ ...m, tool_calls: calls });
      for (const c of calls) {
        const a = answers.get(c.id);
        if (!a) {
          repairs++;
          out.push({ role: "tool", tool_call_id: c.id, name: c.function.name, content: MISSING_RESULT });
        } else if (!isJson(a.content)) {
          repairs++;
          out.push({ ...a, content: JSON.stringify({ ok: false, summary: String(a.content ?? "").slice(0, 500) }) });
        } else {
          out.push(a);
        }
      }
      continue;
    }
    if (m.role === "assistant" && !contentText(m).trim()) {
      repairs++;
      continue;
    }
    const prev = out[out.length - 1];
    if (m.role === "user" && prev && prev.role === "user") {
      out[out.length - 1] = { ...prev, content: `${contentText(prev)}\n\n${contentText(m)}` };
      repairs++;
      continue;
    }
    out.push(m);
  }
  return { messages: out, repairs };
}
