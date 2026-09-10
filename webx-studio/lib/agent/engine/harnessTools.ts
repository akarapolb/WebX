// Tools the engine runs itself instead of sending to the CMS: a visible plan
// the model keeps current (set_plan, update_plan) and a way to stop and ask
// the user (ask_user). They only change the checkpoint and emit events the UI
// renders as a checklist and a question card.
import { validateArgs } from "../validateArgs";
import type { AgentEvent, PlanItem, PlanStatus } from "../types";
import type { RunCheckpoint, ToolCall, ToolOutcome, ToolSpec } from "./types";

export const MAX_PLAN_ITEMS = 200;
const STATUSES: PlanStatus[] = ["pending", "in_progress", "done", "blocked", "skipped"];

const SET_PLAN: ToolSpec = {
  type: "function",
  function: {
    name: "set_plan",
    description:
      "Write down your plan for a task that takes more than three steps, as a checklist the user can follow. Call it once near the start; calling it again replaces the plan. Keep each title short and concrete, one item per piece of work.",
    parameters: {
      type: "object", additionalProperties: false, required: ["items"],
      properties: {
        items: {
          type: "array", minItems: 1, maxItems: MAX_PLAN_ITEMS,
          items: {
            type: "object", additionalProperties: false, required: ["title"],
            properties: { title: { type: "string", minLength: 1, maxLength: 160 }, detail: { type: "string", maxLength: 500 } },
          },
        },
      },
    },
  },
};

const UPDATE_PLAN: ToolSpec = {
  type: "function",
  function: {
    name: "update_plan",
    description:
      "Update plan items as you work: in_progress when you start one, done when it is finished (with a short result such as the created entry's id), blocked or skipped with a note saying why.",
    parameters: {
      type: "object", additionalProperties: false, required: ["updates"],
      properties: {
        updates: {
          type: "array", minItems: 1, maxItems: 50,
          items: {
            type: "object", additionalProperties: false, required: ["id", "status"],
            properties: {
              id: { type: "string" },
              status: { type: "string", enum: STATUSES },
              note: { type: "string", maxLength: 300 },
              result: { type: "string", maxLength: 300 },
            },
          },
        },
      },
    },
  },
};

const ASK_USER: ToolSpec = {
  type: "function",
  function: {
    name: "ask_user",
    description:
      "Ask the user a question when you cannot continue without their decision. The run pauses until they answer. Offer short options when the choice is between known alternatives. Never use it to confirm work the user already asked for.",
    parameters: {
      type: "object", additionalProperties: false, required: ["question"],
      properties: {
        question: { type: "string", minLength: 1, maxLength: 500 },
        options: { type: "array", maxItems: 6, items: { type: "string", minLength: 1, maxLength: 80 } },
      },
    },
  },
};

const BY_NAME = new Map([SET_PLAN, UPDATE_PLAN, ASK_USER].map((s) => [s.function.name, s]));

export const isHarnessTool = (name: string): boolean => BY_NAME.has(name);
export const harnessSpecs = (): ToolSpec[] => [SET_PLAN, UPDATE_PLAN, ASK_USER];

export type HarnessResult = {
  outcome: ToolOutcome;
  events: AgentEvent[];
  /** Set by ask_user: the run should wait for this answer. */
  question?: { question: string; options: string[] };
};

const fail = (summary: string): HarnessResult => ({ outcome: { ok: false, summary }, events: [] });

function progress(items: PlanItem[]) {
  const open = items.filter((i) => i.status === "pending" || i.status === "in_progress");
  return {
    done: items.filter((i) => i.status === "done").length,
    total: items.length,
    open: open.slice(0, 10).map((i) => ({ id: i.id, title: i.title })),
  };
}

export function runHarnessTool(cp: RunCheckpoint, call: ToolCall): HarnessResult {
  const name = call.function.name;
  const spec = BY_NAME.get(name);
  if (!spec) return fail(`Unknown tool "${name}".`);
  let args: any;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    return fail("Malformed tool arguments.");
  }
  const problems = validateArgs(spec.function.parameters, args);
  if (problems.length) return fail(`Invalid arguments for ${name}: ${problems.join("; ")}.`);

  if (name === "set_plan") {
    if (cp.plan?.locked) return fail("This job's plan is fixed by its template. Use update_plan on the existing items instead.");
    const items: PlanItem[] = args.items.map((it: { title: string; detail?: string }, i: number) => ({
      id: String(i + 1),
      title: it.title.trim(),
      ...(it.detail?.trim() ? { detail: it.detail.trim() } : {}),
      status: "pending" as const,
    }));
    cp.plan = { items, nudges: cp.plan?.nudges ?? 0 };
    return {
      outcome: { ok: true, summary: `Plan set with ${items.length} item(s). Mark each one with update_plan as you go.`, data: { items: items.map((i) => ({ id: i.id, title: i.title })) } },
      events: [{ type: "plan", items: structuredClone(items) }],
    };
  }

  if (name === "update_plan") {
    const plan = cp.plan;
    if (!plan) return fail("There is no plan yet. Call set_plan first.");
    const events: AgentEvent[] = [];
    const unknown: string[] = [];
    for (const u of args.updates as { id: string; status: PlanStatus; note?: string; result?: string }[]) {
      const item = plan.items.find((i) => i.id === String(u.id));
      if (!item) {
        unknown.push(String(u.id));
        continue;
      }
      item.status = u.status;
      if (u.note !== undefined) item.note = u.note;
      if (u.result !== undefined) item.result = u.result;
      events.push({ type: "plan_item", id: item.id, status: item.status, ...(item.note ? { note: item.note } : {}), ...(item.result ? { result: item.result } : {}) });
    }
    if (!events.length) return fail(`No plan item has id ${unknown.map((x) => `"${x}"`).join(", ")}. Use the ids set_plan returned.`);
    const p = progress(plan.items);
    const summary = `${p.done} of ${p.total} done` + (unknown.length ? `; no item with id ${unknown.join(", ")}` : "");
    return { outcome: { ok: true, summary, data: p }, events };
  }

  const question = String(args.question).trim();
  const options = ((args.options || []) as string[]).map((s) => s.trim()).filter(Boolean);
  return {
    outcome: { ok: true, summary: "The question is shown to the user. Stop calling tools and wait for their answer." },
    events: [{ type: "question", question, ...(options.length ? { options } : {}) }],
    question: { question, options },
  };
}
