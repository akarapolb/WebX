// Tool argument validation (lib/agent/validateArgs.ts) and content-type
// schema digests (lib/agent/schemaDigest.ts, get_content_type_schema).
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { digestContentType, wordpressAttributes } from "../lib/agent/schemaDigest";
import { executeTool } from "../lib/agent/tools";
import type { AgentRunContext } from "../lib/agent/types";
import { validateArgs } from "../lib/agent/validateArgs";
import { fakeCms } from "./harness/fakeCms";

const ARTICLE = {
  uid: "api::article.article",
  name: "Article",
  attributes: {
    body: { type: "richtext" },
    title: { type: "string", required: true, maxLength: 120 },
    category: { type: "enumeration", enum: ["news", "event"], required: true },
    slug: { type: "uid", targetField: "title" },
    cover: { type: "media", multiple: false },
    tenant: { type: "relation", relation: "manyToOne", target: "api::tenant.tenant" },
    author: { type: "relation", relation: "manyToOne", target: "api::person.person" },
    seo: { type: "component", component: "shared.seo", repeatable: false },
    blocks: { type: "dynamiczone", components: ["block.hero"] },
    internalNote: { type: "text", private: true },
    publishedAt: { type: "datetime" },
    createdAt: { type: "datetime" },
  },
};

function ctx(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    user: { id: 1, email: "editor@example.com", roles: ["editor"], isSuperAdmin: false },
    tenantKey: "dga", level: "draft", allowedTools: null, allowedContentTypes: null, model: "",
    runId: "run-1", threadId: "thread-1", lang: "en", ref: { kind: "none" }, dialect: "gov-portal", engine: "strapi",
    ...overrides,
  };
}

describe("validateArgs", () => {
  const schema = {
    type: "object", additionalProperties: false, required: ["uid", "at"],
    properties: {
      uid: { type: "string" },
      at: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1, maximum: 20 },
      mode: { type: "string", enum: ["a", "b"] },
      blocks: { type: "array", maxItems: 2, items: { type: "object", required: ["comp"], properties: { comp: { type: "string" } } } },
    },
  };

  test("a valid call has no problems", () => {
    assert.deepEqual(validateArgs(schema, { uid: "api::page.page", at: 0, limit: 5, mode: "a", blocks: [{ comp: "block.hero" }] }), []);
  });

  test("reports each problem by field, in words the model can act on", () => {
    assert.deepEqual(validateArgs(schema, { at: "0", limit: 50, mode: "c", extra: 1 }), [
      "uid is required",
      "at must be an integer",
      "limit must be at most 20",
      "mode must be one of: \"a\", \"b\"",
      "extra is not an accepted argument (accepted: uid, at, limit, mode, blocks)",
    ]);
  });

  test("checks nested array items and limits", () => {
    assert.deepEqual(validateArgs(schema, { uid: "x", at: 1, blocks: [{}, { comp: 3 }, { comp: "c" }] }), [
      "blocks must have at most 2 item(s)",
      "blocks[0].comp is required",
      "blocks[1].comp must be a string",
    ]);
  });

  test("a non-object argument list is rejected", () => {
    assert.deepEqual(validateArgs(schema, [1, 2]), ["arguments must be an object"]);
  });
});

describe("digestContentType", () => {
  const digest = digestContentType(ARTICLE);
  const field = (name: string) => digest.fields.find((f) => f.name === name);

  test("lists required fields first and drops system and private fields", () => {
    assert.deepEqual(digest.fields.slice(0, 2).map((f) => f.name), ["title", "category"]);
    for (const hidden of ["internalNote", "publishedAt", "createdAt"]) assert.equal(field(hidden), undefined, hidden);
  });

  test("carries limits, allowed values and how to fill special fields", () => {
    assert.equal(field("title")?.maxLength, 120);
    assert.deepEqual(field("category")?.enum, ["news", "event"]);
    assert.match(field("slug")!.note!, /generated from title/);
    assert.match(field("blocks")!.note!, /insert_blocks/);
    assert.equal(field("seo")?.component, "shared.seo");
    assert.equal(field("author")?.target, "api::person.person");
  });

  test("marks what the agent cannot set", () => {
    assert.equal(field("tenant")?.writable, false);
    assert.equal(field("cover")?.writable, false);
    assert.equal(field("title")?.writable, true);
  });

  test("applies the caller's hidden and read-only fields", () => {
    const d = digestContentType(ARTICLE, { hidden: ["body"], readonly: ["category"] });
    assert.equal(d.fields.find((f) => f.name === "body"), undefined);
    const category = d.fields.find((f) => f.name === "category")!;
    assert.equal(category.writable, false);
    assert.match(category.note!, /Read-only/);
  });

  test("WordPress types get title, excerpt, content and their ACF fields", () => {
    const d = digestContentType({ uid: "wp:page", name: "Page", attributes: wordpressAttributes(["blocks", "icon"], ["blocks"]) });
    assert.deepEqual(d.fields.map((f) => [f.name, f.type]), [["title", "string"], ["excerpt", "text"], ["content", "html"], ["blocks", "json"], ["icon", "string"]]);
    assert.match(d.fields.find((f) => f.name === "blocks")!.note!, /insert_blocks/);
  });
});

describe("get_content_type_schema and argument validation through executeTool", () => {
  test("returns the digest for an allowed type", async () => {
    const cms = fakeCms([ARTICLE]);
    const r = await executeTool(ctx({ level: "read", cms: cms.cms }), "get_content_type_schema", JSON.stringify({ uid: ARTICLE.uid }));
    assert.equal(r.ok, true);
    assert.match(r.summary, /required: title, category/);
    assert.equal(r.data.uid, ARTICLE.uid);
  });

  test("an unknown or disallowed type is refused with a way forward", async () => {
    const cms = fakeCms([ARTICLE]);
    const unknown = await executeTool(ctx({ level: "read", cms: cms.cms }), "get_content_type_schema", JSON.stringify({ uid: "api::faq.faq" }));
    assert.equal(unknown.ok, false);
    assert.match(unknown.summary, /list_content_types/);
    const disallowed = await executeTool(
      ctx({ level: "read", cms: cms.cms, allowedContentTypes: ["api::faq.faq"] }), "get_content_type_schema", JSON.stringify({ uid: ARTICLE.uid }),
    );
    assert.match(disallowed.summary, /not allowed to work with/);
  });

  test("bad arguments are rejected before the tool runs", async () => {
    const cms = fakeCms([ARTICLE]);
    const c = ctx({ cms: cms.cms });
    const cases: [string, Record<string, unknown>, RegExp][] = [
      ["search_content", { uid: ARTICLE.uid, limit: 50 }, /limit must be at most 20/],
      ["search_content", { uid: ARTICLE.uid, query: "x" }, /query is not an accepted argument/],
      ["get_entry", { uid: ARTICLE.uid }, /id is required/],
      ["insert_blocks", { uid: "api::page.page", id: "1", at: "0", blocks: [{ comp: "block.hero" }] }, /at must be an integer/],
    ];
    for (const [name, args, expected] of cases) {
      const r = await executeTool(c, name, JSON.stringify(args));
      assert.equal(r.ok, false, name);
      assert.match(r.summary, expected);
    }
    assert.equal(cms.calls.length, 0);
  });

  test("a CMS outage is marked retryable, a validation error is not", async () => {
    const cms = fakeCms([ARTICLE]);
    const { CmsError } = await import("../lib/cms/types");
    cms.failNext("list", new CmsError("list failed: Internal Server Error", 500));
    const outage = await executeTool(ctx({ cms: cms.cms }), "search_content", JSON.stringify({ uid: ARTICLE.uid }));
    assert.equal(outage.retryable, true);
    const invalid = await executeTool(ctx({ cms: cms.cms }), "create_draft_entry", JSON.stringify({ uid: ARTICLE.uid, fields: {} }));
    assert.equal(invalid.retryable, false);
  });
});
