// Regression tests for the loop failures found dogfooding the agent with Kimi
// K3 that M2 closes: bug 1 (guessing content-type uids turn after turn) and
// bug 4 (a Strapi validation error the model couldn't recover from), plus the
// reconnaissance loop behind the 18-type run. Bugs 2, 3, 5 and 6 are covered
// in agent-engine.test.ts.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { startRun } from "../lib/agent/engine/checkpoint";
import { limitsFor } from "../lib/agent/engine/limits";
import { runSlice } from "../lib/agent/engine/loop";
import type { ChatRequest, EngineDeps, EngineTools, RunCheckpoint, RunMode } from "../lib/agent/engine/types";
import { executeTool, toolIsWrite, toolSpecs } from "../lib/agent/tools";
import type { AgentEvent, AgentRunContext } from "../lib/agent/types";
import { fakeClock } from "./harness/fakeClock";
import { fakeCms } from "./harness/fakeCms";
import { fakeTools } from "./harness/fakeTools";
import { replyText, replyTools, scriptedChat, toolCall, type ScriptedChat } from "./harness/scriptedChat";

function newRun(mode: RunMode = "docked", message = "Find the services page"): RunCheckpoint {
  return startRun({ runId: "run-1", threadId: "thread-1", mode, lang: "en", ref: { kind: "none" }, model: "webx-kimi", message });
}

function harness(chat: ScriptedChat, tools: EngineTools) {
  const events: AgentEvent[] = [];
  const deps: EngineDeps = {
    chat: chat.chat, tools, clock: fakeClock(), emit: (e) => events.push(e),
    systemPrompt: () => "You are the WebX test agent.", strictProtocol: true, random: () => 0,
  };
  return { deps, events };
}

const lastToolResult = (req: ChatRequest) => JSON.parse(req.messages.filter((m) => m.role === "tool").pop()!.content as string);

/** The real tool registry over an in-memory CMS: the same wiring as deps.server.ts, minus audit attribution. */
function realTools(ctx: AgentRunContext): EngineTools {
  return {
    specs: () => toolSpecs(ctx),
    isWrite: toolIsWrite,
    execute: (call) => executeTool(ctx, call.function.name, call.function.arguments),
  };
}

function toolCtx(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    user: { id: 1, email: "editor@example.com", roles: ["editor"], isSuperAdmin: false },
    tenantKey: "dga", level: "draft", allowedTools: null, allowedContentTypes: null, model: "",
    runId: "run-1", threadId: "thread-1", lang: "en", ref: { kind: "none" }, dialect: "gov-portal", engine: "strapi",
    ...overrides,
  };
}

describe("bug 1 — guessing content-type uids", () => {
  const PAGE = { uid: "api::page.page", name: "Page", attributes: { title: { type: "string", required: true } } };
  const guesses = ["page", "pages", "site_page", "web_page", "gov_page", "content_page"];

  test("the third failed guess gets a harness note, and three more after it end the run", async () => {
    const cms = fakeCms([PAGE]);
    const chat = scriptedChat([
      ...guesses.slice(0, 3).map((uid, i) => ({ reply: replyTools([toolCall("search_content", { uid }, `g${i}`)]) })),
      {
        expect: (req: ChatRequest) => assert.match(lastToolResult(req).harness_note, /list_content_types/),
        reply: replyTools([toolCall("search_content", { uid: guesses[3] }, "g3")]),
      },
      ...guesses.slice(4).map((uid, i) => ({ reply: replyTools([toolCall("search_content", { uid }, `g${i + 4}`)]) })),
    ]);
    const h = harness(chat, realTools(toolCtx({ cms: cms.cms })));
    const r = await runSlice(newRun(), h.deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "stuck");
    assert.equal(r.resumable, false);
    assert.equal(chat.remaining(), 0);
    const stopped = h.events.find((e) => e.type === "stopped");
    assert.ok(stopped && stopped.type === "stopped");
    assert.equal(stopped.resumable, false);
    assert.match(stopped.message, /search_content/);
    assert.equal(cms.calls.length, 0, "no guessed uid ever reached the CMS");
  });

  test("a model that follows the note recovers and finishes", async () => {
    const cms = fakeCms([PAGE], { [PAGE.uid]: [{ title: "Services" }] });
    const chat = scriptedChat([
      ...guesses.slice(0, 3).map((uid, i) => ({ reply: replyTools([toolCall("search_content", { uid }, `g${i}`)]) })),
      { reply: replyTools([toolCall("list_content_types", {}, "l1")]) },
      { reply: replyTools([toolCall("search_content", { uid: PAGE.uid, q: "services" }, "s1")]) },
      { expect: (req: ChatRequest) => assert.equal(lastToolResult(req).ok, true), reply: replyText("Found the Services page.") },
    ]);
    const h = harness(chat, realTools(toolCtx({ cms: cms.cms })));
    const r = await runSlice(newRun(), h.deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.equal(h.events.some((e) => e.type === "stopped"), false);
  });
});

describe("bug 4 — Strapi validation errors", () => {
  const ARTICLE = {
    uid: "api::article.article",
    name: "Article",
    attributes: {
      title: { type: "string", required: true },
      category: { type: "enumeration", enum: ["news", "event"], required: true },
      body: { type: "richtext" },
      tenant: { type: "relation", relation: "manyToOne", target: "api::tenant.tenant" },
    },
  };

  test("the error names the missing fields and points at get_content_type_schema", async () => {
    const cms = fakeCms([ARTICLE]);
    const c = toolCtx({ cms: cms.cms });
    const failed = await executeTool(c, "create_draft_entry", JSON.stringify({ uid: ARTICLE.uid, fields: { body: "Hello" } }));
    assert.equal(failed.ok, false);
    assert.match(failed.summary, /title must be defined/);
    assert.match(failed.summary, /category must be defined/);
    assert.match(failed.summary, /get_content_type_schema with \{"uid":"api::article\.article"\}/);

    const schema = await executeTool(c, "get_content_type_schema", JSON.stringify({ uid: ARTICLE.uid }));
    assert.deepEqual(schema.data.fields.find((f: any) => f.name === "category").enum, ["news", "event"]);
    assert.equal(schema.data.fields.find((f: any) => f.name === "tenant").writable, false);

    const created = await executeTool(c, "create_draft_entry", JSON.stringify({ uid: ARTICLE.uid, fields: { title: "Hello", category: "news" } }));
    assert.equal(created.ok, true);
    assert.deepEqual(created.data, { uid: ARTICLE.uid, id: "doc-1" });
    assert.equal(cms.rows(ARTICLE.uid).length, 1);
  });

  test("in a run, the model reads the schema after the failure and the second create lands once", async () => {
    const cms = fakeCms([ARTICLE]);
    const chat = scriptedChat([
      { reply: replyTools([toolCall("create_draft_entry", { uid: ARTICLE.uid, fields: { body: "Hello" } }, "w1")]) },
      {
        expect: (req: ChatRequest) => assert.match(lastToolResult(req).summary, /get_content_type_schema/),
        reply: replyTools([toolCall("get_content_type_schema", { uid: ARTICLE.uid }, "s1")]),
      },
      { reply: replyTools([toolCall("create_draft_entry", { uid: ARTICLE.uid, fields: { title: "Hello", category: "news", body: "Hello" } }, "w2")]) },
      { reply: replyText("Created the article draft.") },
    ]);
    const h = harness(chat, realTools(toolCtx({ cms: cms.cms })));
    const r = await runSlice(newRun("docked", "Write an article draft"), h.deps, limitsFor("docked"));

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.equal(cms.rows(ARTICLE.uid).length, 1);
    assert.deepEqual(r.applied, [{ uid: ARTICLE.uid, id: "doc-1" }]);
  });
});

describe("the 18-type run — reconnaissance in a background job", () => {
  const TYPES = Array.from({ length: 18 }, (_, i) => `api::type-${i}.type-${i}`);

  function jobTools() {
    return fakeTools({
      get_entry: { run: (a) => ({ ok: true, summary: "Loaded an existing entry", data: { id: a.id } }) },
      create_draft_entry: { write: true, run: (a) => ({ ok: true, summary: `Created a draft ${a.uid}`, data: { uid: a.uid, id: `d-${a.uid}` } }) },
    });
  }
  const readTurn = (n: number) => ({ reply: replyTools([toolCall("get_entry", { uid: TYPES[n % 18], id: "1" }, `r${n}`)]) });
  const createTurn = (from: number, to: number) => ({
    reply: replyTools(TYPES.slice(from, to).map((uid, i) => toolCall("create_draft_entry", { uid, fields: { title: "Example" } }, `w${from + i}`))),
  });

  test("four reading turns get a nudge; a model that then writes finishes every type", async () => {
    const tools = jobTools();
    const chat = scriptedChat([
      readTurn(0), readTurn(1), readTurn(2), readTurn(3),
      { expect: (req: ChatRequest) => assert.match(lastToolResult(req).harness_note, /only reading/), ...createTurn(0, 10) },
      createTurn(10, 18),
      { reply: replyText("Created one draft of each of the 18 types.") },
    ]);
    const h = harness(chat, tools.tools);
    const r = await runSlice(newRun("job", "One draft of every editorial type"), h.deps, limitsFor("job"));

    chat.assertClean();
    assert.equal(r.stop, "text");
    assert.equal(r.checkpoint.ledger.applied.length, 18);
    assert.equal(new Set(r.checkpoint.ledger.applied.map((x) => x.uid)).size, 18);
  });

  test("a model that keeps reading after the nudge is stopped", async () => {
    const chat = scriptedChat(Array.from({ length: 8 }, (_, i) => readTurn(i)));
    const h = harness(chat, jobTools().tools);
    const r = await runSlice(newRun("job", "One draft of every editorial type"), h.deps, limitsFor("job"));

    chat.assertClean();
    assert.equal(r.stop, "stuck");
    assert.equal(chat.remaining(), 0);
    assert.equal(r.checkpoint.ledger.applied.length, 0);
  });
});
