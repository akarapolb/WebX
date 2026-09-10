// Background job slices (lib/agent/jobs/runner.ts) and the owner check
// (lib/agent/jobs/owner.ts), against an in-memory job store.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { limitsFor } from "../lib/agent/engine/limits";
import { OUTCOME_UNKNOWN } from "../lib/agent/engine/loop";
import type { ChatRequest, EngineTools } from "../lib/agent/engine/types";
import { evaluateJobOwner, stricterPolicy, type OwnerFacts } from "../lib/agent/jobs/owner";
import { finishFor, runJobSlice, type RunnerDeps, type SliceOutcome } from "../lib/agent/jobs/runner";
import type { AgentJobRow, JobPolicy, OwnerRefusal } from "../lib/agent/jobs/types";
import { fakeClock } from "./harness/fakeClock";
import { fakeTools } from "./harness/fakeTools";
import { memoryJobStore, SimulatedWorkerCrash } from "./harness/memoryJobStore";
import { replyText, replyTools, scriptedChat, toolCall, type ScriptedChat } from "./harness/scriptedChat";

const POLICY: JobPolicy = { level: "draft", tools: null, contentTypes: null, model: "webx-kimi", dialect: "gov-portal", engine: "strapi", tenantKey: "dga" };

function newJob(over: Partial<AgentJobRow> = {}): AgentJobRow {
  return {
    documentId: "job-1", tenantKey: "dga", ownerEmail: "editor@dga.local", ownerUserId: "7", engine: "strapi",
    title: "Two news drafts", goal: "Create two news drafts", lang: "en", requiredLevel: "draft",
    runState: "queued", attempts: 0, checkpointSeq: 0, eventSeq: 0, tokensUsed: 0, ...over,
  };
}

function deps(
  jobs: ReturnType<typeof memoryJobStore>, chat: ScriptedChat, tools: EngineTools,
  o: { maxTurns?: number; refuse?: OwnerRefusal; shouldYield?: () => boolean } = {},
): RunnerDeps {
  return {
    store: jobs.store,
    clock: fakeClock(),
    limits: limitsFor("job", { maxTurns: o.maxTurns ?? 8 }),
    shouldYield: o.shouldYield,
    asOwner: async (_job, fn) =>
      o.refuse
        ? { ok: false, reason: o.refuse }
        : { ok: true, value: await fn({ user: { id: 7, email: "editor@dga.local", roles: ["Editor"], isSuperAdmin: false }, policy: POLICY, lang: "en" }) },
    engineDeps: () => ({ chat: chat.chat, tools, systemPrompt: () => "You are the WebX job agent.", strictProtocol: true, random: () => 0 }),
  };
}

/** Claims and runs slices the way the worker does, until the job stops being queued. */
async function drain(jobs: ReturnType<typeof memoryJobStore>, d: RunnerDeps, id = "job-1", max = 12): Promise<SliceOutcome[]> {
  const outcomes: SliceOutcome[] = [];
  for (let i = 0; i < max; i++) {
    const claimed = jobs.claim(id);
    if (!claimed) break;
    outcomes.push(await runJobSlice(claimed, d));
  }
  return outcomes;
}

const creates = () =>
  fakeTools({
    create_draft_entry: { write: true, run: (a) => ({ ok: true, summary: `Created ${a.title}`, data: { uid: "api::news.news", id: `doc-${a.title}` } }) },
    search_content: { run: (a) => ({ ok: true, summary: "1 of 1 match(es)", data: [{ id: `doc-${a.q}`, title: a.q }] }) },
  });
const lastTool = (req: ChatRequest) => JSON.parse(req.messages.filter((m) => m.role === "tool").pop()!.content as string);

describe("runJobSlice", () => {
  test("a job runs slice by slice until done, checkpointing every turn", async () => {
    const jobs = memoryJobStore([newJob()]);
    const tools = creates();
    const chat = scriptedChat([
      { reply: replyTools([toolCall("create_draft_entry", { title: "A" }, "w1")]) },
      { reply: replyTools([toolCall("create_draft_entry", { title: "B" }, "w2"), toolCall("create_draft_entry", { title: "A" }, "w3")]) },
      { reply: replyText("Created both drafts.") },
    ]);
    const outcomes = await drain(jobs, deps(jobs, chat, tools.tools, { maxTurns: 1 }));

    chat.assertClean();
    assert.deepEqual(outcomes.map((o) => o.state), ["queued", "queued", "done"]);
    const job = jobs.get("job-1");
    assert.equal(job.outcome, "completed");
    assert.equal(job.leaseToken, null);
    assert.equal(job.progress?.turns, 3);
    assert.deepEqual(job.result?.applied.map((x: any) => x.id), ["doc-A", "doc-B"], "an entry written twice is listed once");
    assert.equal(job.tokensUsed, 360);
    assert.ok(job.checkpointSeq >= 5);
    const seqs = jobs.events("job-1").map((e) => e.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
    assert.equal(new Set(seqs).size, seqs.length);
    assert.equal(jobs.events("job-1").filter((e) => e.type === "tool_result").length, 3);
    assert.equal(tools.calls.length, 3);
  });

  test("a worker that dies mid-write is reclaimed, and the write is reported as unknown instead of run again", async () => {
    const jobs = memoryJobStore([newJob()]);
    const tools = creates();
    const chat = scriptedChat([
      { reply: replyTools([toolCall("create_draft_entry", { title: "A" }, "w1")]) },
      { reply: replyTools([toolCall("create_draft_entry", { title: "B" }, "w2")]) },
      {
        expect: (req) => assert.equal(lastTool(req).summary, OUTCOME_UNKNOWN),
        reply: replyTools([toolCall("search_content", { uid: "api::news.news", q: "B" }, "s1")]),
      },
      { reply: replyText("A was created; B needs checking by an editor.") },
    ]);
    const d = deps(jobs, chat, tools.tools);
    jobs.crashOnCheckpoint("pre_write", 2);

    await assert.rejects(runJobSlice(jobs.claim("job-1")!, d), SimulatedWorkerCrash);
    assert.equal(jobs.get("job-1").runState, "running", "a crashed worker leaves its lease to expire");
    jobs.expireLease("job-1");
    const outcomes = await drain(jobs, d);

    chat.assertClean();
    assert.deepEqual(outcomes.map((o) => o.state), ["done"]);
    assert.deepEqual(tools.calls.filter((c) => c.name === "create_draft_entry").map((c) => c.args.title), ["A"]);
    assert.equal(jobs.get("job-1").attempts, 1);
  });

  test("a cancel requested during a turn stops the job before the next one", async () => {
    const jobs = memoryJobStore([newJob()]);
    const tools = fakeTools({
      create_draft_entry: {
        write: true,
        run: () => {
          jobs.requestCancel("job-1");
          return { ok: true, summary: "Created A" };
        },
      },
    });
    const chat = scriptedChat([{ reply: replyTools([toolCall("create_draft_entry", { title: "A" }, "w1")]) }, { reply: replyText("never sent") }]);
    const outcomes = await drain(jobs, deps(jobs, chat, tools.tools));

    assert.deepEqual(outcomes.map((o) => o.state), ["cancelled"]);
    assert.equal(chat.remaining(), 1);
    assert.equal(jobs.get("job-1").cancelRequestedAt, null);
  });

  test("an owner who lost access pauses the job without calling the model", async () => {
    const jobs = memoryJobStore([newJob()]);
    const chat = scriptedChat([{ reply: replyText("never sent") }]);
    const outcomes = await drain(jobs, deps(jobs, chat, creates().tools, { refuse: "owner_revoked" }));

    assert.deepEqual(outcomes, [{ state: "paused", reason: "owner_revoked" }]);
    assert.equal(chat.requests.length, 0);
    assert.equal(jobs.get("job-1").stateReason, "owner_revoked");
  });

  test("a question pauses the job, and the answer continues it", async () => {
    const jobs = memoryJobStore([newJob()]);
    const chat = scriptedChat([
      { reply: replyTools([toolCall("ask_user", { question: "Formal or friendly tone?", options: ["Formal", "Friendly"] }, "q1")]) },
      {
        expect: (req) => assert.deepEqual([req.messages[req.messages.length - 1].role, req.messages[req.messages.length - 1].content], ["user", "Formal"]),
        reply: replyText("Wrote both drafts in a formal tone."),
      },
    ]);
    const d = deps(jobs, chat, creates().tools);

    assert.deepEqual((await drain(jobs, d)).map((o) => [o.state, o.reason]), [["paused", "needs_input"]]);
    assert.deepEqual(jobs.get("job-1").progress?.question, { question: "Formal or friendly tone?", options: ["Formal", "Friendly"] });

    jobs.answer("job-1", "Formal");
    assert.deepEqual((await drain(jobs, d)).map((o) => o.state), ["done"]);
    chat.assertClean();
    assert.equal(jobs.get("job-1").pendingAnswer, null);
  });

  test("a job over its token budget ends as partial_budget", async () => {
    const jobs = memoryJobStore([newJob({ budget: { maxTokens: 150 } })]);
    const tools = creates();
    const chat = scriptedChat([
      { reply: replyTools([toolCall("create_draft_entry", { title: "A" }, "w1")]) },
      { reply: replyTools([toolCall("create_draft_entry", { title: "B" }, "w2")]) },
      { reply: replyText("never sent") },
    ]);
    const outcomes = await drain(jobs, deps(jobs, chat, tools.tools));

    assert.deepEqual(outcomes.map((o) => o.state), ["done"]);
    assert.equal(jobs.get("job-1").outcome, "partial_budget");
    assert.equal(tools.calls.length, 2);
    assert.equal(chat.remaining(), 1);
  });

  test("a worker that lost its lease stops without writing to the job", async () => {
    const jobs = memoryJobStore([newJob()]);
    const tools = fakeTools({
      get_entry: {
        run: () => {
          jobs.stealLease("job-1");
          return { ok: true, summary: "Loaded" };
        },
      },
    });
    const chat = scriptedChat([{ reply: replyTools([toolCall("get_entry", { id: "1" }, "r1")]) }, { reply: replyText("never sent") }]);
    const outcome = await runJobSlice(jobs.claim("job-1")!, deps(jobs, chat, tools.tools));

    assert.equal(outcome.state, "lease_lost");
    const job = jobs.get("job-1");
    assert.equal(job.runState, "running");
    assert.equal(job.leaseToken, "lease-of-another-worker");
  });

  test("a worker shutting down requeues the job at the next turn", async () => {
    const jobs = memoryJobStore([newJob()]);
    let stopping = false;
    const tools = fakeTools({
      get_entry: {
        run: () => {
          stopping = true;
          return { ok: true, summary: "Loaded" };
        },
      },
    });
    const chat = scriptedChat([{ reply: replyTools([toolCall("get_entry", { id: "1" }, "r1")]) }]);
    const outcome = await runJobSlice(jobs.claim("job-1")!, deps(jobs, chat, tools.tools, { shouldYield: () => stopping }));

    assert.equal(outcome.state, "queued");
    assert.equal(jobs.get("job-1").runState, "queued");
  });
});

describe("finishFor", () => {
  test("maps every stop onto a job state", () => {
    const now = Date.UTC(2026, 8, 11);
    const cases: [string, string, string | undefined][] = [
      ["slice_end", "queued", undefined], ["waiting_input", "paused", "needs_input"], ["paused", "paused", "user"],
      ["cancelled", "cancelled", "user"], ["budget", "done", undefined], ["done", "done", undefined], ["text", "done", undefined],
      ["done_incomplete", "done", ""], ["stuck", "done", ""], ["policy", "paused", "policy_changed"], ["llm_error", "failed", undefined],
    ];
    for (const [stop, state, reason] of cases) {
      const f = finishFor({ stop: stop as any, stopMessage: "" }, now);
      assert.equal(f.runState, state, stop);
      if (reason !== "") assert.equal(f.stateReason, reason, stop);
    }
    assert.equal(finishFor({ stop: "retry_later", stopMessage: "" }, now).notBefore, new Date(now + 60_000).toISOString());
    assert.equal(finishFor({ stop: "paused", stopMessage: "" }, now, true).runState, "queued");
    assert.equal(finishFor({ stop: "stuck", stopMessage: "" }, now).outcome, "partial_stuck");
  });
});

describe("evaluateJobOwner", () => {
  const job = { tenantKey: "dga", ownerEmail: "Editor@dga.local", ownerUserId: "7", engine: "strapi" as const, requiredLevel: "draft" as const, policySnapshot: null };
  const facts = (over: Partial<OwnerFacts> = {}): OwnerFacts => ({
    tenant: { key: "dga", engine: "strapi", plan: "pro", adminEmails: ["editor@dga.local"], features: { agent: { level: "draft", background: true } } },
    account: { id: 7, email: "editor@dga.local", active: true },
    livePolicy: POLICY,
    ...over,
  });

  test("an owner still in the workspace with the same active account and enough autonomy may run", () => {
    assert.deepEqual(evaluateJobOwner(job, facts()), { ok: true, policy: POLICY });
  });

  test("refuses when the owner left, was replaced, or was deactivated", () => {
    const t = facts().tenant!;
    assert.equal(evaluateJobOwner(job, facts({ tenant: { ...t, adminEmails: ["someone@dga.local"] } })).ok, false);
    assert.deepEqual(evaluateJobOwner(job, facts({ account: { id: 8, active: true } })), { ok: false, reason: "owner_revoked" });
    assert.deepEqual(evaluateJobOwner(job, facts({ account: { id: 7, active: false } })), { ok: false, reason: "owner_revoked" });
    assert.deepEqual(evaluateJobOwner(job, facts({ tenant: { ...t, engine: "wordpress" } })), { ok: false, reason: "owner_revoked" });
    assert.deepEqual(evaluateJobOwner(job, facts({ tenant: null })), { ok: false, reason: "owner_revoked" });
  });

  test("refuses when the plan, the background-jobs switch or the autonomy level no longer allow it", () => {
    const t = facts().tenant!;
    assert.deepEqual(evaluateJobOwner(job, facts({ tenant: { ...t, plan: "free" } })), { ok: false, reason: "plan" });
    assert.deepEqual(evaluateJobOwner(job, facts({ tenant: { ...t, features: { agent: { level: "draft" } } } })), { ok: false, reason: "policy_changed" });
    assert.deepEqual(evaluateJobOwner(job, facts({ livePolicy: { ...POLICY, level: "suggest" } })), { ok: false, reason: "policy_changed" });
    assert.deepEqual(evaluateJobOwner(job, facts({ livePolicy: null })), { ok: false, reason: "policy_changed" });
  });

  test("a job never gains reach: the stricter of the saved and live policy applies", () => {
    const saved: JobPolicy = { ...POLICY, level: "draft", tools: ["create_draft_entry", "get_entry"], contentTypes: ["api::news.news"] };
    const live: JobPolicy = { ...POLICY, level: "draft_submit", tools: ["get_entry", "search_content"], contentTypes: null, model: "webx-default" };
    assert.deepEqual(stricterPolicy(saved, live), { ...live, level: "draft", tools: ["get_entry"], contentTypes: ["api::news.news"] });
  });
});
