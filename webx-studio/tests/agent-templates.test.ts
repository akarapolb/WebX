// Job templates (lib/agent/jobs/templates.ts) and the direct-template runner
// (lib/agent/jobs/direct.ts).
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { startRun } from "../lib/agent/engine/checkpoint";
import { limitsFor } from "../lib/agent/engine/limits";
import { runSlice } from "../lib/agent/engine/loop";
import type { RunCheckpoint } from "../lib/agent/engine/types";
import { runDirectJobSlice, type DirectDeps } from "../lib/agent/jobs/direct";
import {
  bulkCreateGoal, bulkCreatePlan, directReport, parseTemplateParams, requiredLevelFor, templateTitle, tickPlanForCreate,
  TemplateError, verifyBulkCreate, type DirectResult,
} from "../lib/agent/jobs/templates";
import type { AgentJobRow } from "../lib/agent/jobs/types";
import { digestContentType } from "../lib/agent/schemaDigest";
import type { AgentEvent } from "../lib/agent/types";
import { fakeClock } from "./harness/fakeClock";
import { fakeTools } from "./harness/fakeTools";
import { memoryJobStore } from "./harness/memoryJobStore";
import { replyText, replyTools, scriptedChat, toolCall } from "./harness/scriptedChat";

const NAMES = { "api::news.news": "News", "api::faq.faq": "FAQ" };

describe("parseTemplateParams", () => {
  test("bulk_create normalizes its parameters and rejects bad ones", () => {
    assert.deepEqual(parseTemplateParams("bulk_create", { contentTypes: ["api::news.news", "api::news.news", "api::faq.faq"], perType: "2", brief: " Digital ID " }), {
      contentTypes: ["api::news.news", "api::faq.faq"], perType: 2, brief: "Digital ID", submit: false,
    });
    assert.throws(() => parseTemplateParams("bulk_create", { contentTypes: [] }), /at least one content type/);
    assert.throws(() => parseTemplateParams("bulk_create", { contentTypes: ["news"] }), TemplateError);
    assert.throws(() => parseTemplateParams("bulk_create", { contentTypes: ["api::news.news"], perType: 9 }), /from 1 to 5/);
  });

  test("bulk_translate needs a different target language and caps its size", () => {
    const p = parseTemplateParams("bulk_translate", { contentType: "api::faq.faq", targetLocale: "en", updatedSince: "2026-09-01" });
    assert.equal(p.max, 50);
    assert.equal(p.updatedSince, "2026-09-01T00:00:00.000Z");
    assert.throws(() => parseTemplateParams("bulk_translate", { contentType: "api::faq.faq", targetLocale: "th", sourceLocale: "th" }), /must differ/);
    assert.throws(() => parseTemplateParams("bulk_translate", { contentType: "api::faq.faq", targetLocale: "english" }), /language code/);
    assert.throws(() => parseTemplateParams("bulk_translate", { contentType: "api::faq.faq", targetLocale: "en", max: 500 }), /from 1 to 200/);
  });

  test("audit_all and custom", () => {
    assert.equal(parseTemplateParams("audit_all", { contentTypes: ["api::news.news"] }).max, 100);
    assert.throws(() => parseTemplateParams("custom", { goal: "   " }), /goal is required/);
    assert.deepEqual(parseTemplateParams("custom", { goal: "Tidy the FAQs", tools: ["get_entry", "get_entry"] }), { goal: "Tidy the FAQs", tools: ["get_entry"] });
  });

  test("required levels and titles", () => {
    assert.equal(requiredLevelFor("bulk_create", { submit: true }, "draft"), "draft_submit");
    assert.equal(requiredLevelFor("audit_all", {}, "draft_submit"), "read");
    assert.equal(requiredLevelFor("custom", {}, "suggest"), "suggest");
    assert.equal(templateTitle("bulk_create", { contentTypes: ["api::news.news", "api::faq.faq"], perType: 2 }, NAMES, "en"), "Create 4 drafts across 2 content types");
    assert.equal(templateTitle("bulk_translate", { contentType: "api::faq.faq", targetLocale: "en" }, NAMES, "th"), "แปลFAQเป็น en");
  });
});

describe("bulk_create", () => {
  const p = { contentTypes: ["api::news.news", "api::faq.faq"], perType: 1, brief: "Digital ID launch", submit: false };

  test("the plan has one item per draft, and the goal carries each type's writable fields", () => {
    assert.deepEqual(bulkCreatePlan(p, NAMES).map((i) => [i.id, i.title, i.detail]), [["news-1", "News draft", "api::news.news"], ["faq-1", "FAQ draft", "api::faq.faq"]]);
    const goal = bulkCreateGoal(p, [
      digestContentType({ uid: "api::news.news", name: "News", attributes: { title: { type: "string", required: true, maxLength: 120 }, kind: { type: "enumeration", enum: ["news", "event"] }, tenant: { type: "relation", target: "api::tenant.tenant" } } }),
      digestContentType({ uid: "api::faq.faq", name: "FAQ", attributes: { question: { type: "string", required: true }, answer: { type: "text" } } }),
    ]);
    assert.match(goal, /Brief from the editor: Digital ID launch/);
    assert.match(goal, /- api::news\.news \(News\): title\* \(string, max 120 chars\); kind \(enumeration, one of "news"\|"event"\)/);
    assert.doesNotMatch(goal, /tenant/, "fields the agent can't set are left out");
    assert.match(goal, /- api::faq\.faq \(FAQ\): question\* \(string\); answer \(text\)/);
  });

  test("a created entry ticks the next open item for its type, and verification catches items with no draft", () => {
    const plan = { items: bulkCreatePlan({ ...p, perType: 2 }, NAMES), locked: true, nudges: 0 };
    assert.equal(tickPlanForCreate(plan, "api::news.news", "doc-1")?.id, "news-1");
    assert.equal(tickPlanForCreate(plan, "api::news.news", "doc-2")?.id, "news-2");
    assert.equal(tickPlanForCreate(plan, "api::news.news", "doc-3"), null);
    plan.items.find((i) => i.id === "faq-1")!.status = "done"; // the model claimed it
    const changed = verifyBulkCreate(plan, [{ uid: "api::news.news", id: "doc-1" }, { uid: "api::news.news", id: "doc-2" }]);
    assert.deepEqual(changed.map((i) => [i.id, i.status, i.note]), [["faq-1", "pending", "Marked done, but no draft was created for it."]]);
    assert.deepEqual(verifyBulkCreate(plan, [{ uid: "api::news.news", id: "doc-1" }, { uid: "api::news.news", id: "doc-2" }]), [], "reopening is idempotent");
  });

  test("in a run, creations tick the fixed plan and the run finishes as done", async () => {
    const tools = fakeTools({
      create_draft_entry: { write: true, run: (a) => ({ ok: true, summary: `Created a draft ${a.uid}`, data: { uid: a.uid, id: `doc-${a.uid}` } }) },
    });
    const chat = scriptedChat([
      { reply: replyTools([toolCall("create_draft_entry", { uid: "api::news.news", fields: { title: "A" } }, "w1"), toolCall("create_draft_entry", { uid: "api::faq.faq", fields: { question: "Q" } }, "w2")]) },
      { reply: replyText("Both drafts are created.") },
    ]);
    const cp: RunCheckpoint = startRun({ runId: "job-1", threadId: "", mode: "job", lang: "en", ref: { kind: "none" }, model: "webx-kimi", message: bulkCreateGoal(p, []) });
    cp.plan = { items: bulkCreatePlan(p, NAMES), locked: true, nudges: 0 };
    const events: AgentEvent[] = [];
    const r = await runSlice(cp, {
      chat: chat.chat, tools: tools.tools, clock: fakeClock(), emit: (e) => events.push(e), systemPrompt: () => "sys", strictProtocol: true,
      afterTool: (c, call, out) => {
        if (call.function.name !== "create_draft_entry" || !out.ok) return;
        const item = tickPlanForCreate(c.plan, out.data.uid, out.data.id);
        return item ? [{ type: "plan_item", id: item.id, status: item.status, result: item.result }] : undefined;
      },
    }, limitsFor("job"));

    chat.assertClean();
    assert.equal(r.stop, "done");
    assert.deepEqual(events.filter((e) => e.type === "plan_item").map((e: any) => [e.id, e.result]), [["news-1", "doc-api::news.news"], ["faq-1", "doc-api::faq.faq"]]);
  });
});

describe("direct templates", () => {
  const items = [1, 2, 3].map((n) => ({ uid: "api::news.news", id: `doc-${n}`, title: `News ${n}` }));
  const job = (over: Partial<AgentJobRow> = {}): AgentJobRow => ({
    documentId: "job-1", tenantKey: "dga", ownerEmail: "editor@dga.local", ownerUserId: "7", engine: "strapi",
    title: "Audit news", goal: "Audit news", template: "audit_all", params: { contentTypes: ["api::news.news"], max: 100, items },
    lang: "en", requiredLevel: "read", runState: "queued", attempts: 0, checkpointSeq: 0, eventSeq: 0, tokensUsed: 0, ...over,
  });
  const owner = { user: { id: 7, email: "editor@dga.local", roles: ["Editor"], isSuperAdmin: false }, policy: { level: "read" as const, tools: null, contentTypes: null, model: "", dialect: "gov-portal", engine: "strapi" as const, tenantKey: "dga" }, lang: "en" as const };

  function deps(jobs: ReturnType<typeof memoryJobStore>, runItem: DirectDeps["runItem"], over: Partial<DirectDeps> = {}): DirectDeps {
    return { store: jobs.store, clock: fakeClock(), asOwner: async (_j, fn) => ({ ok: true, value: await fn(owner) }), runItem, itemsPerSlice: 2, ...over };
  }

  test("an audit runs item by item across slices and ends with a report", async () => {
    const jobs = memoryJobStore([job()]);
    const seen: string[] = [];
    const d = deps(jobs, async (_j, _o, item) => {
      seen.push(item.id);
      return item.id === "doc-2"
        ? { ...item, ok: true, summary: "2 finding(s)", findings: [{ dimension: "SEO", severity: "medium", message: "Missing meta" }, { dimension: "PDPA", severity: "high", message: "ID number" }] }
        : { ...item, ok: true, summary: "No issues found", findings: [] };
    });

    assert.deepEqual((await runDirectJobSlice(jobs.claim("job-1")!, d)).state, "queued");
    assert.deepEqual(jobs.get("job-1").progress?.done, 2);
    assert.deepEqual((await runDirectJobSlice(jobs.claim("job-1")!, d)).state, "done");

    const final = jobs.get("job-1");
    assert.deepEqual(seen, ["doc-1", "doc-2", "doc-3"]);
    assert.equal(final.outcome, "completed");
    assert.equal(final.result?.finalText, "Checked 3 of 3 entries: 1 with findings (1 high, 1 medium).");
    assert.equal(final.result?.items.length, 3);
    assert.equal(jobs.events("job-1").filter((e) => e.type === "tool_result").length, 3);
  });

  test("a cancel stops before the next item, and an owner who lost access pauses it untouched", async () => {
    const jobs = memoryJobStore([job()]);
    const d = deps(jobs, async (_j, _o, item) => {
      jobs.requestCancel("job-1");
      return { ...item, ok: true, summary: "No issues found" };
    });
    assert.equal((await runDirectJobSlice(jobs.claim("job-1")!, d)).state, "cancelled");
    assert.equal(jobs.get("job-1").progress?.done, 1);

    const other = memoryJobStore([job()]);
    let ran = false;
    const refused = deps(other, async (_j, _o, item) => ((ran = true), { ...item, ok: true, summary: "" }), { asOwner: async () => ({ ok: false, reason: "owner_revoked" }) });
    assert.deepEqual(await runDirectJobSlice(other.claim("job-1")!, refused), { state: "paused", reason: "owner_revoked" });
    assert.equal(ran, false);
  });

  test("translation reports count what was filed, skipped and failed", () => {
    const results: DirectResult[] = [
      { uid: "api::faq.faq", id: "1", title: "A", ok: true, summary: "Filed a translation review" },
      { uid: "api::faq.faq", id: "2", title: "B", ok: true, skipped: true, summary: "Skipped" },
      { uid: "api::faq.faq", id: "3", title: "C", ok: false, summary: "Translation produced nothing usable" },
    ];
    assert.deepEqual(directReport("bulk_translate", results, 3, "en"), {
      counts: { translated: 1, skipped: 1, failed: 1 },
      text: "Filed 1 translation review for 3 entries; 1 skipped (a translation is already in review); 1 failed.",
    });
  });
});
