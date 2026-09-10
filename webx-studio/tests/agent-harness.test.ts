// The engine's own harness tools and plan verification (Phase 9, M3):
// set_plan / update_plan / ask_user, reminders for unfinished plan items,
// and the job-mode system prompt.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { applyInput, parseCheckpoint, startRun } from "../lib/agent/engine/checkpoint";
import { runHarnessTool } from "../lib/agent/engine/harnessTools";
import { limitsFor } from "../lib/agent/engine/limits";
import { runSlice } from "../lib/agent/engine/loop";
import type { ChatRequest, EngineDeps, EngineTools, RunCheckpoint, RunMode } from "../lib/agent/engine/types";
import { nudgeText, openItems, verifyPlan } from "../lib/agent/engine/verify";
import { jobSystemPrompt } from "../lib/agent/prompts";
import type { AgentEvent, AgentRunContext } from "../lib/agent/types";
import { fakeClock } from "./harness/fakeClock";
import { fakeTools } from "./harness/fakeTools";
import { replyText, replyTools, scriptedChat, toolCall, type ScriptedChat } from "./harness/scriptedChat";

function newRun(mode: RunMode = "docked", message = "Create a news draft and an FAQ draft"): RunCheckpoint {
  return startRun({ runId: "run-1", threadId: "thread-1", mode, lang: "en", ref: { kind: "none" }, model: "webx-kimi", message });
}

function harness(chat: ScriptedChat, tools: EngineTools, extra: Partial<EngineDeps> = {}) {
  const events: AgentEvent[] = [];
  const deps: EngineDeps = {
    chat: chat.chat, tools, clock: fakeClock(), emit: (e) => events.push(e),
    systemPrompt: () => "You are the WebX test agent.", strictProtocol: true, random: () => 0, ...extra,
  };
  return { deps, events };
}

const cmsTools = () =>
  fakeTools({
    create_draft_entry: { write: true, run: (a) => ({ ok: true, summary: `Created a draft ${a.uid}`, data: { uid: a.uid, id: `doc-${a.uid}` } }) },
  });

const call = (name: string, args: Record<string, unknown>, id = name) => toolCall(name, args, id);
const lastMessage = (req: ChatRequest) => req.messages[req.messages.length - 1];
const ofType = <T extends AgentEvent["type"]>(events: AgentEvent[], type: T) => events.filter((e): e is Extract<AgentEvent, { type: T }> => e.type === type);

describe("runHarnessTool", () => {
  test("set_plan numbers the items from 1 and emits the plan", () => {
    const cp = newRun();
    const r = runHarnessTool(cp, call("set_plan", { items: [{ title: " Create the news draft " }, { title: "Create the FAQ draft", detail: "Use the services category" }] }));
    assert.equal(r.outcome.ok, true);
    assert.deepEqual(cp.plan?.items.map((i) => [i.id, i.title, i.status]), [["1", "Create the news draft", "pending"], ["2", "Create the FAQ draft", "pending"]]);
    assert.deepEqual(r.outcome.data.items, [{ id: "1", title: "Create the news draft" }, { id: "2", title: "Create the FAQ draft" }]);
    assert.equal(r.events[0].type, "plan");
  });

  test("set_plan refuses a plan fixed by a job template, and more than 200 items", () => {
    const locked = newRun();
    locked.plan = { items: [{ id: "a", title: "Fixed", status: "pending" }], locked: true, nudges: 0 };
    assert.match(runHarnessTool(locked, call("set_plan", { items: [{ title: "Mine" }] })).outcome.summary, /fixed by its template/);
    const big = runHarnessTool(newRun(), call("set_plan", { items: Array.from({ length: 201 }, (_, i) => ({ title: `Item ${i}` })) }));
    assert.equal(big.outcome.ok, false);
    assert.match(big.outcome.summary, /at most 200/);
  });

  test("update_plan applies known ids, reports unknown ones, and needs a plan", () => {
    const cp = newRun();
    assert.match(runHarnessTool(cp, call("update_plan", { updates: [{ id: "1", status: "done" }] })).outcome.summary, /set_plan first/);
    runHarnessTool(cp, call("set_plan", { items: [{ title: "A" }, { title: "B" }] }));
    const r = runHarnessTool(cp, call("update_plan", { updates: [{ id: "1", status: "done", result: "doc-1" }, { id: "9", status: "done" }] }));
    assert.equal(r.outcome.ok, true);
    assert.equal(r.outcome.summary, "1 of 2 done; no item with id 9");
    assert.deepEqual(r.outcome.data.open, [{ id: "2", title: "B" }]);
    assert.deepEqual(r.events, [{ type: "plan_item", id: "1", status: "done", result: "doc-1" }]);
    assert.equal(runHarnessTool(cp, call("update_plan", { updates: [{ id: "9", status: "done" }] })).outcome.ok, false);
    assert.equal(runHarnessTool(cp, call("update_plan", { updates: [{ id: "2", status: "finished" }] })).outcome.ok, false);
  });

  test("ask_user returns the question to wait on", () => {
    const r = runHarnessTool(newRun(), call("ask_user", { question: "Which category?", options: ["News", " Events "] }));
    assert.deepEqual(r.question, { question: "Which category?", options: ["News", "Events"] });
    assert.deepEqual(r.events, [{ type: "question", question: "Which category?", options: ["News", "Events"] }]);
  });
});

describe("verify", () => {
  test("reports what is done, blocked and still open", () => {
    const plan = {
      nudges: 0,
      items: [
        { id: "1", title: "A", status: "done" as const },
        { id: "2", title: "B", status: "blocked" as const, note: "No permission" },
        { id: "3", title: "C", status: "in_progress" as const },
      ],
    };
    assert.deepEqual(openItems(plan).map((i) => i.id), ["3"]);
    const v = verifyPlan(plan);
    assert.equal(v.ok, false);
    assert.equal(v.report, "1 of 3 plan items done, 1 blocked, 1 not started or unfinished. Not done: 2. B (blocked: No permission); 3. C (in_progress)");
    assert.match(nudgeText(openItems(plan)), /3\. C/);
  });
});

describe("plans in the loop", () => {
  test("a plan the model completes ends as done, with harness calls kept out of the tool rows", async () => {
    const tools = cmsTools();
    const chat = scriptedChat([
      { reply: replyTools([call("set_plan", { items: [{ title: "Create the news draft" }, { title: "Create the FAQ draft" }] }, "p1")]) },
      { reply: replyTools([call("create_draft_entry", { uid: "api::news.news", fields: {} }, "w1"), call("update_plan", { updates: [{ id: "1", status: "done", result: "doc-api::news.news" }] }, "u1")]) },
      { reply: replyTools([call("create_draft_entry", { uid: "api::faq.faq", fields: {} }, "w2"), call("update_plan", { updates: [{ id: "2", status: "done" }] }, "u2")]) },
      { reply: replyText("Both drafts are ready.") },
    ]);
    const h = harness(chat, tools.tools);
    const r = await runSlice(newRun(), h.deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "done");
    assert.equal(r.finalText, "Both drafts are ready.");
    assert.equal(ofType(h.events, "plan").length, 1);
    assert.deepEqual(ofType(h.events, "plan_item").map((e) => [e.id, e.status]), [["1", "done"], ["2", "done"]]);
    assert.deepEqual(ofType(h.events, "verification").map((e) => e.ok), [true]);
    assert.deepEqual(ofType(h.events, "tool_call").map((e) => e.name), ["create_draft_entry", "create_draft_entry"]);
    assert.equal(r.checkpoint.counters.toolCalls, 2);
    assert.deepEqual(r.checkpoint.ledger.toolSteps.map((s) => s.name), ["create_draft_entry", "create_draft_entry"]);
    assert.equal(ofType(h.events, "stopped").length, 0);
  });

  test("the harness tools are offered alongside the CMS tools", async () => {
    const chat = scriptedChat([
      { expect: (req) => assert.deepEqual(req.tools?.map((t) => t.function.name), ["set_plan", "update_plan", "ask_user", "create_draft_entry"]), reply: replyText("Hello.") },
    ]);
    await runSlice(newRun(), harness(chat, cmsTools().tools).deps, limitsFor("docked"));
    chat.assertClean();
  });

  test("finishing with open items earns two reminders, then ends as done_incomplete", async () => {
    const chat = scriptedChat([
      { reply: replyTools([call("set_plan", { items: [{ title: "Create the news draft" }, { title: "Create the FAQ draft" }] }, "p1")]) },
      { reply: replyText("All done.") },
      { expect: (req) => assert.match(String(lastMessage(req).content), /Harness check: 2 plan item\(s\) are not finished:\n1\. Create the news draft\n2\. Create the FAQ draft/), reply: replyText("Really done.") },
      { expect: (req) => assert.equal(lastMessage(req).role, "user"), reply: replyText("Truly done.") },
    ]);
    const h = harness(chat, cmsTools().tools);
    const r = await runSlice(newRun(), h.deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "done_incomplete");
    assert.equal(r.resumable, false);
    assert.equal(chat.remaining(), 0);
    assert.equal(r.checkpoint.plan?.nudges, 2);
    const verification = ofType(h.events, "verification");
    assert.deepEqual(verification.map((e) => e.ok), [false]);
    const stopped = ofType(h.events, "stopped");
    assert.equal(stopped.length, 1);
    assert.equal(stopped[0].resumable, false);
    assert.match(stopped[0].message, /2 plan item/);
  });

  test("a model that acts on the reminder finishes as done", async () => {
    const tools = cmsTools();
    const chat = scriptedChat([
      { reply: replyTools([call("set_plan", { items: [{ title: "Create the news draft" }] }, "p1")]) },
      { reply: replyText("Done.") },
      { reply: replyTools([call("create_draft_entry", { uid: "api::news.news", fields: {} }, "w1"), call("update_plan", { updates: [{ id: "1", status: "done" }] }, "u1")]) },
      { reply: replyText("Now it is done.") },
    ]);
    const h = harness(chat, tools.tools);
    const r = await runSlice(newRun(), h.deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "done");
    assert.equal(tools.calls.length, 1);
  });

  test("blocked items with a reason are not nagged about", async () => {
    const chat = scriptedChat([
      { reply: replyTools([call("set_plan", { items: [{ title: "Create the news draft" }] }, "p1")]) },
      { reply: replyTools([call("update_plan", { updates: [{ id: "1", status: "blocked", note: "News is not enabled for the agent" }] }, "u1")]) },
      { reply: replyText("I could not create the news draft.") },
    ]);
    const h = harness(chat, cmsTools().tools);
    const r = await runSlice(newRun(), h.deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "done_incomplete");
    assert.equal(r.checkpoint.plan?.nudges, 0);
  });
});

describe("ask_user in the loop", () => {
  test("in chat the run waits for the answer, and the answer resumes it", async () => {
    const chat = scriptedChat([
      { reply: replyTools([call("ask_user", { question: "Which category should the FAQ use?", options: ["General", "Services"] }, "q1")]) },
      {
        expect: (req) => {
          const [tool, answer] = req.messages.slice(-2);
          assert.equal(tool.role, "tool");
          assert.match(String(tool.content), /wait for their answer/);
          assert.deepEqual([answer.role, answer.content], ["user", "Services"]);
        },
        reply: replyText("Using the Services category."),
      },
    ]);
    const first = harness(chat, cmsTools().tools);
    const r1 = await runSlice(newRun(), first.deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r1.stop, "waiting_input");
    assert.equal(r1.resumable, true);
    assert.equal(ofType(first.events, "stopped").length, 0, "the question card is the prompt, not a stop notice");
    assert.deepEqual(ofType(first.events, "question").map((e) => e.options), [["General", "Services"]]);
    assert.equal(r1.checkpoint.waiting?.question, "Which category should the FAQ use?");

    const saved = parseCheckpoint(JSON.stringify(r1.checkpoint));
    assert.ok(saved);
    const answered = applyInput(saved, { kind: "answer", text: "Services" });
    assert.equal(answered.waiting, undefined);
    const r2 = await runSlice(answered, harness(chat, cmsTools().tools).deps, limitsFor("docked"));
    chat.assertClean();
    assert.equal(r2.stop, "text");
  });

  test("in an unattended job the question is answered for the model, and a third question ends the run", async () => {
    const chat = scriptedChat([
      { reply: replyTools([call("ask_user", { question: "Formal or casual tone?" }, "q1")]) },
      { expect: (req) => assert.match(String(lastMessage(req).content), /No one is available/), reply: replyTools([call("ask_user", { question: "Which date?" }, "q2")]) },
      { reply: replyTools([call("ask_user", { question: "Which author?" }, "q3")]) },
    ]);
    const h = harness(chat, cmsTools().tools, { onQuestion: "auto" });
    const r = await runSlice(newRun("job"), h.deps, limitsFor("job"));

    chat.assertClean();
    assert.equal(r.stop, "done_incomplete");
    assert.equal(chat.remaining(), 0);
    assert.equal(ofType(h.events, "question").length, 0);
  });
});

describe("jobSystemPrompt", () => {
  const ctx: AgentRunContext = {
    user: { id: 1, email: "editor@example.com", roles: ["editor"], isSuperAdmin: false },
    tenantKey: "dga", level: "draft", allowedTools: null, allowedContentTypes: ["api::news.news"], model: "",
    runId: "run-1", threadId: "thread-1", lang: "en", ref: { kind: "none" }, dialect: "gov-portal", engine: "strapi",
  };

  test("tells an unattended model the scope is confirmed and how to work", () => {
    const p = jobSystemPrompt(ctx, { onQuestion: "auto" });
    assert.match(p, /background job/);
    assert.match(p, /do not ask to confirm it/);
    assert.match(p, /set_plan/);
    assert.match(p, /get_content_type_schema/);
    assert.match(p, /No one can answer questions/);
    assert.match(p, /api::news\.news/);
    assert.doesNotMatch(p, /Ask a clarifying question before a bulk operation/);
  });

  test("a job someone can answer allows ask_user, and a template plan is not replaced", () => {
    const p = jobSystemPrompt(ctx, { onQuestion: "wait", planLocked: true });
    assert.match(p, /ask_user/);
    assert.match(p, /already fixed/);
    assert.doesNotMatch(p, /No one can answer questions/);
  });

  test("is written in Thai for a Thai workspace", () => {
    assert.match(jobSystemPrompt({ ...ctx, lang: "th" }, { onQuestion: "auto" }), /งานเบื้องหลัง/);
  });
});
