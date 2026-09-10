// Scenario files run in process: the engine and the real tool registry over an
// in-memory CMS, with the model's replies scripted by tests/scenarios/*.json.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { startRun } from "../lib/agent/engine/checkpoint";
import { limitsFor } from "../lib/agent/engine/limits";
import { runSlice } from "../lib/agent/engine/loop";
import type { ChatFn, EngineDeps, EngineTools } from "../lib/agent/engine/types";
import { executeTool, toolIsWrite, toolSpecs } from "../lib/agent/tools";
import type { AgentRunContext } from "../lib/agent/types";
import { fakeClock } from "./harness/fakeClock";
import { fakeCms } from "./harness/fakeCms";
import { loadScenario, scenarioChat } from "./harness/scenario";

const PAGE = {
  uid: "api::page.page",
  name: "Page",
  attributes: { title: { type: "string", required: true }, blocks: { type: "dynamiczone", components: ["block.hero"] } },
};
const ARTICLE = { uid: "api::article.article", name: "Article", attributes: { title: { type: "string", required: true } } };

function toolCtx(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    user: { id: 1, email: "editor@example.com", roles: ["editor"], isSuperAdmin: false },
    tenantKey: "dga", level: "draft", allowedTools: null, allowedContentTypes: null, model: "",
    runId: "run-1", threadId: "thread-1", lang: "en", ref: { kind: "none" }, dialect: "gov-portal", engine: "strapi",
    ...overrides,
  };
}

function deps(chat: ChatFn, ctx: AgentRunContext): EngineDeps {
  const tools: EngineTools = {
    specs: () => toolSpecs(ctx),
    isWrite: toolIsWrite,
    execute: (call) => executeTool(ctx, call.function.name, call.function.arguments),
  };
  return { chat, tools, clock: fakeClock(), emit: () => {}, systemPrompt: () => "You are the WebX test agent.", strictProtocol: true };
}

const newRun = (message: string) =>
  startRun({ runId: "run-1", threadId: "thread-1", mode: "docked", lang: "en", ref: { kind: "none" }, model: "webx-kimi", message });

describe("scenarios in process", () => {
  test("create-page-then-add-section chains the new page's id into insert_blocks", async () => {
    const cms = fakeCms([PAGE]);
    const { chat, run } = scenarioChat(loadScenario("create-page-then-add-section"));
    const r = await runSlice(newRun("Create a Digital ID Services page with a hero"), deps(chat, toolCtx({ cms: cms.cms })), limitsFor("docked"));

    assert.deepEqual(run.failures, []);
    assert.deepEqual(run.violations, []);
    assert.equal(r.stop, "text");
    assert.equal(run.remaining, 0);
    const pages = cms.rows(PAGE.uid);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].blocks.length, 1);
    assert.equal(pages[0].blocks[0].heading, "Digital ID Services");
  });

  test("write-draft-field fills its variables and writes the field", async () => {
    const cms = fakeCms([ARTICLE], { [ARTICLE.uid]: [{ documentId: "a1", title: "Old title" }] });
    const { chat, run } = scenarioChat(loadScenario("write-draft-field"), { uid: ARTICLE.uid, id: "a1", field: "title", value: "New title" });
    const r = await runSlice(newRun("Retitle the article"), deps(chat, toolCtx({ cms: cms.cms })), limitsFor("docked"));

    assert.deepEqual(run.failures, []);
    assert.equal(r.stop, "text");
    assert.equal(cms.rows(ARTICLE.uid)[0].title, "New title");
  });

  test("a step whose guard does not match fails the run with a clear reason", async () => {
    const cms = fakeCms([ARTICLE], { [ARTICLE.uid]: [{ documentId: "a1", title: "Old title" }] });
    // "missing" does not exist, so the write fails and step 2's guard (ok: true) does not match.
    const { chat, run } = scenarioChat(loadScenario("write-draft-field"), { uid: ARTICLE.uid, id: "missing", field: "title", value: "New title" });
    const r = await runSlice(newRun("Retitle the article"), deps(chat, toolCtx({ cms: cms.cms })), limitsFor("docked"));

    assert.equal(r.stop, "llm_error");
    assert.equal(run.failures.length, 1);
    assert.match(run.failures[0], /expected last tool/);
  });
});
