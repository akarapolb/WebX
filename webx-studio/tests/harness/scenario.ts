// Scenario files (tests/scenarios/*.scenario.json) script a model's replies
// turn by turn. The same file drives in-process engine tests (scenarioChat)
// and the HTTP mock LLM that e2e runs point webx-studio at (mockLlmServer.ts),
// and either way every request is checked against the provider protocol.
//
// Values in a reply may use {{vars.name}} (supplied when the scenario is
// selected) and {{last.data.id}}-style paths into the latest tool result.
import { readFileSync } from "node:fs";
import path from "node:path";
import { LlmError } from "../../lib/agent/engine/errors";
import { checkProtocol, type ProtocolViolation } from "../../lib/agent/engine/invariants";
import type { ChatReply, ChatRequest, ToolCall, WireMsg } from "../../lib/agent/engine/types";

export type ScenarioStep = {
  /** Guard on the latest tool result in the request. */
  when?: { lastTool?: { name?: string; ok?: boolean } };
  /** Tools that must be offered on this request. */
  expectTools?: string[];
  reply: {
    text?: string;
    toolCalls?: { id?: string; name: string; args?: unknown }[];
    reasoning?: string;
    finishReason?: string;
  };
};

export type Scenario = { name: string; description?: string; steps: ScenarioStep[] };

export type ScenarioRequest = { messages?: WireMsg[]; tools?: { function?: { name?: string } }[] };
export type ScenarioOutcome = { ok: true; reply: ChatReply } | { ok: false; status: number; error: string };

const SCENARIO_DIR = path.join(__dirname, "..", "scenarios");

export function loadScenario(name: string): Scenario {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid scenario name "${name}"`);
  return JSON.parse(readFileSync(path.join(SCENARIO_DIR, `${name}.scenario.json`), "utf8")) as Scenario;
}

function lastToolResult(messages: WireMsg[]): { name: string; result: any } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "tool") continue;
    let result: any = null;
    try {
      result = JSON.parse(String(m.content));
    } catch {
      /* not JSON: the protocol check reports it */
    }
    return { name: String(m.name || ""), result };
  }
  return null;
}

const WHOLE = /^\{\{\s*([\w.]+)\s*\}\}$/;
const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

function lookup(scope: Record<string, unknown>, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), scope);
}

function fill(v: unknown, scope: Record<string, unknown>, missing: string[]): unknown {
  if (typeof v === "string") {
    const whole = WHOLE.exec(v);
    if (whole) {
      const x = lookup(scope, whole[1]);
      if (x === undefined) missing.push(whole[1]);
      return x === undefined ? v : x;
    }
    return v.replace(TOKEN, (token, dotted: string) => {
      const x = lookup(scope, dotted);
      if (x === undefined) {
        missing.push(dotted);
        return token;
      }
      return typeof x === "string" ? x : JSON.stringify(x);
    });
  }
  if (Array.isArray(v)) return v.map((x) => fill(x, scope, missing));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [String(fill(k, scope, missing)), fill(x, scope, missing)]));
  }
  return v;
}

export class ScenarioRun {
  readonly scenario: Scenario;
  readonly vars: Record<string, unknown>;
  readonly violations: { request: number; violations: ProtocolViolation[] }[] = [];
  readonly failures: string[] = [];
  requests = 0;
  private step = 0;

  constructor(scenario: Scenario, vars: Record<string, unknown> = {}) {
    this.scenario = scenario;
    this.vars = vars;
  }

  get remaining(): number {
    return this.scenario.steps.length - this.step;
  }

  respond(req: ScenarioRequest): ScenarioOutcome {
    const index = this.requests++;
    const messages = Array.isArray(req.messages) ? req.messages : [];
    const errors = checkProtocol(messages, { toolsSent: Boolean(req.tools?.length) }).filter((v) => v.severity === "error");
    if (errors.length) {
      this.violations.push({ request: index, violations: errors });
      return { ok: false, status: 400, error: "Invalid request: " + errors.map((e) => `${e.code}@${e.index}`).join(", ") };
    }

    const stepIndex = this.step;
    const step = this.scenario.steps[stepIndex];
    if (!step) return this.fail(500, `request #${index}: scenario "${this.scenario.name}" has no steps left`);

    const last = lastToolResult(messages);
    const guard = step.when?.lastTool;
    if (guard && (!last || (guard.name !== undefined && last.name !== guard.name) || (guard.ok !== undefined && last.result?.ok !== guard.ok))) {
      const got = last ? JSON.stringify({ name: last.name, ok: last.result?.ok, summary: last.result?.summary }) : "no tool result";
      return this.fail(409, `request #${index}: step ${stepIndex} expected last tool ${JSON.stringify(guard)}, got ${got}`);
    }
    const offered = new Set((req.tools || []).map((t) => t.function?.name));
    const notOffered = (step.expectTools || []).filter((n) => !offered.has(n));
    if (notOffered.length) return this.fail(409, `request #${index}: step ${stepIndex} expected these tools to be offered: ${notOffered.join(", ")}`);

    const missing: string[] = [];
    const scope = { vars: this.vars, last: last?.result ?? null };
    const calls: ToolCall[] = (step.reply.toolCalls || []).map((c, i) => ({
      id: c.id ?? `call_s${stepIndex}_${i}`,
      type: "function",
      function: { name: c.name, arguments: JSON.stringify(fill(c.args ?? {}, scope, missing)) },
    }));
    const text = step.reply.text !== undefined ? String(fill(step.reply.text, scope, missing)) : null;
    if (missing.length) return this.fail(409, `request #${index}: step ${stepIndex} could not fill ${missing.map((m) => `{{${m}}}`).join(", ")}`);

    this.step++;
    return {
      ok: true,
      reply: {
        message: { content: text, ...(calls.length ? { tool_calls: calls } : {}), ...(step.reply.reasoning ? { reasoning_content: step.reply.reasoning } : {}) },
        usage: { prompt_tokens: 120, completion_tokens: 30 },
        finishReason: step.reply.finishReason ?? (calls.length ? "tool_calls" : "stop"),
      },
    };
  }

  private fail(status: number, error: string): ScenarioOutcome {
    this.failures.push(error);
    return { ok: false, status, error };
  }
}

/** A ChatFn backed by a scenario, for in-process engine tests. */
export function scenarioChat(scenario: Scenario, vars: Record<string, unknown> = {}) {
  const run = new ScenarioRun(scenario, vars);
  const chat = async (req: ChatRequest): Promise<ChatReply> => {
    const out = run.respond(req);
    if (!out.ok) throw new LlmError(out.error, { status: out.status, kind: out.status === 400 ? "bad_request" : "unprocessable", body: out.error });
    return out.reply;
  };
  return { run, chat };
}
