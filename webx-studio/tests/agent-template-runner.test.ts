// A template job through the slice runner: the plan saved on the job when it
// was created (jobs/templates.ts) seeds the run once, created drafts tick it
// across slices, and the job ends done only when every item has its draft.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { limitsFor } from "../lib/agent/engine/limits";
import type { EngineDeps } from "../lib/agent/engine/types";
import { runJobSlice, type RunnerDeps } from "../lib/agent/jobs/runner";
import { bulkCreatePlan, tickPlanForCreate, verifyBulkCreate } from "../lib/agent/jobs/templates";
import type { AgentJobRow, JobOwner } from "../lib/agent/jobs/types";
import type { AgentEvent } from "../lib/agent/types";
import { fakeClock } from "./harness/fakeClock";
import { fakeTools } from "./harness/fakeTools";
import { memoryJobStore } from "./harness/memoryJobStore";
import { replyText, replyTools, scriptedChat, toolCall, type ScriptStep } from "./harness/scriptedChat";

const OWNER: JobOwner = {
  user: { id: 7, email: "editor@dga.local", roles: ["Editor"], isSuperAdmin: false },
  policy: { level: "draft", tools: null, contentTypes: null, model: "webx-kimi", dialect: "gov-portal", engine: "strapi", tenantKey: "dga" },
  lang: "en",
};

// The same hooks the worker gives bulk_create jobs (lib/agent/worker.ts).
const hooks: Pick<EngineDeps, "afterTool" | "checkPlan"> = {
  afterTool: (cp, call, out) => {
    if (call.function.name !== "create_draft_entry" || !out.ok) return;
    const item = tickPlanForCreate(cp.plan, out.data.uid, out.data.id);
    return item ? [{ type: "plan_item", id: item.id, status: item.status, result: item.result }] : undefined;
  },
  checkPlan: (cp) => (cp.plan ? verifyBulkCreate(cp.plan, cp.ledger.applied).map((i): AgentEvent => ({ type: "plan_item", id: i.id, status: i.status, note: i.note })) : undefined),
};

function setup(steps: ScriptStep[]) {
  const plan = bulkCreatePlan({ contentTypes: ["api::news.news"], perType: 2, brief: "", submit: false }, { "api::news.news": "News" });
  const job: AgentJobRow = {
    documentId: "job-1", tenantKey: "dga", ownerEmail: "editor@dga.local", ownerUserId: "7", engine: "strapi",
    title: "Create 2 drafts", goal: "Create 2 news drafts.", template: "bulk_create", params: { plan }, lang: "en", requiredLevel: "draft",
    runState: "queued", attempts: 0, checkpointSeq: 0, eventSeq: 0, tokensUsed: 0,
  };
  const jobs = memoryJobStore([job]);
  const tools = fakeTools({
    create_draft_entry: { write: true, run: (a) => ({ ok: true, summary: "Created a draft", data: { uid: a.uid, id: `doc-${a.fields.title}` } }) },
  });
  const chat = scriptedChat(steps);
  const deps: RunnerDeps = {
    store: jobs.store, clock: fakeClock(), limits: limitsFor("job", { maxTurns: 1 }),
    asOwner: async (_job, fn) => ({ ok: true, value: await fn(OWNER) }),
    engineDeps: () => ({ chat: chat.chat, tools: tools.tools, systemPrompt: () => "sys", strictProtocol: true, random: () => 0, ...hooks }),
  };
  const drain = async () => {
    const states: string[] = [];
    for (let i = 0; i < 8; i++) {
      const claimed = jobs.claim("job-1");
      if (!claimed) break;
      states.push((await runJobSlice(claimed, deps)).state);
    }
    return states;
  };
  return { jobs, chat, drain };
}

const create = (title: string, id: string) => replyTools([toolCall("create_draft_entry", { uid: "api::news.news", fields: { title } }, id)]);

describe("a template job's fixed plan", () => {
  test("seeds the run once and is ticked by each created draft across slices", async () => {
    const { jobs, chat, drain } = setup([
      { reply: create("A", "w1") },
      { reply: create("B", "w2") },
      { reply: replyText("Both drafts are created.") },
    ]);

    assert.deepEqual(await drain(), ["queued", "queued", "done"]);
    chat.assertClean();
    const job = jobs.get("job-1");
    assert.equal(job.outcome, "completed");
    assert.deepEqual(job.progress?.plan?.map((i) => [i.id, i.status, i.result]), [["news-1", "done", "doc-A"], ["news-2", "done", "doc-B"]]);
    assert.equal(jobs.events("job-1").filter((e) => e.type === "plan").length, 1, "announced once, not on every slice");
  });

  test("an item the model marks done without a draft is reopened, and the job ends incomplete if it never gets one", async () => {
    const { jobs, chat, drain } = setup([
      { reply: create("A", "w1") },
      { reply: replyTools([toolCall("update_plan", { updates: [{ id: "news-2", status: "done" }] }, "p1")]) },
      { reply: replyText("All done.") },
      { reply: replyText("All done.") },
      { reply: replyText("All done.") },
    ]);

    assert.equal((await drain()).at(-1), "done");
    chat.assertClean();
    const job = jobs.get("job-1");
    assert.equal(job.outcome, "incomplete");
    const item = job.progress?.plan?.find((i) => i.id === "news-2");
    assert.equal(item?.status, "pending");
    assert.equal(item?.note, "Marked done, but no draft was created for it.");
  });
});
