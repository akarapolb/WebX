// Studio's side of the agent worker's tool gateway (lib/agent/toolGateway.ts,
// docs/target-architecture.md D13): the job a request carries, how Studio's tools
// are described to the worker, that what is offered follows the owner's level and
// allow-list, that a tool runs through the same enforcement as an interactive run,
// and the secret check. The owner checks themselves (runAsJobOwner) are covered by
// agent-jobs.test.ts; the routes just call them.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { gatewayAuthorized, gatewayTools, parseGatewayJob, riskOf, runGatewayTool, toGatewayTool, ctxForOwner } from "../lib/agent/toolGateway";
import { availableTools } from "../lib/agent/tools";
import type { AgentRunContext } from "../lib/agent/types";
import { fakeCms } from "./harness/fakeCms";

function ctx(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    user: { id: 1, email: "editor@example.com", roles: ["editor"], isSuperAdmin: false } as any,
    tenantKey: "dga", level: "draft_submit", allowedTools: null, allowedContentTypes: null, model: "",
    runId: "job-1", threadId: "", lang: "en", ref: { kind: "none" }, dialect: "gov-portal", engine: "strapi", ...overrides,
  };
}
const goodJob = { documentId: "job-1", tenantKey: "dga", ownerEmail: "ann@example.org", ownerUserId: 7, engine: "strapi", requiredLevel: "read", policySnapshot: null };

describe("parseGatewayJob", () => {
  test("accepts the identity a job carries and normalises it", () => {
    const j = parseGatewayJob({ ...goodJob, policySnapshot: { level: "draft", tools: null, contentTypes: null, model: "", dialect: "gov-portal", engine: "strapi", tenantKey: "dga" } }) as any;
    assert.equal(j.ownerUserId, "7", "the account id is compared as text, as runAsJobOwner does");
    assert.equal(j.lang, "en");
    assert.equal(j.policySnapshot.level, "draft");
  });
  test("accepts exactly what the Rust worker sends (webx-agent Job::identity)", () => {
    const fromWorker = { documentId: "job-1", tenantKey: "dga", ownerEmail: "ann@example.org", ownerUserId: "7", engine: "strapi", requiredLevel: "read", policySnapshot: null, lang: "en" };
    const j = parseGatewayJob(fromWorker) as any;
    assert.equal(typeof j, "object");
    assert.deepEqual(Object.keys(j).sort(), ["documentId", "engine", "lang", "ownerEmail", "ownerUserId", "policySnapshot", "requiredLevel", "tenantKey"]);
  });
  test("takes `id` for `documentId`, as the worker names it", () => {
    const { documentId, ...rest } = goodJob;
    assert.equal((parseGatewayJob({ ...rest, id: "abc" }) as any).documentId, "abc");
  });
  test("names what is missing or wrong instead of guessing", () => {
    assert.equal(parseGatewayJob(null), "job is required");
    assert.match(parseGatewayJob({ ...goodJob, tenantKey: "" }) as string, /tenantKey/);
    assert.match(parseGatewayJob({ ...goodJob, ownerEmail: undefined }) as string, /ownerEmail/);
    assert.match(parseGatewayJob({ ...goodJob, ownerUserId: undefined }) as string, /ownerUserId/);
    assert.match(parseGatewayJob({ ...goodJob, engine: "rust" }) as string, /engine/);
    assert.match(parseGatewayJob({ ...goodJob, requiredLevel: "root" }) as string, /requiredLevel/);
    assert.match(parseGatewayJob({ ...goodJob, policySnapshot: { level: "root" } }) as string, /policySnapshot/);
  });
});

describe("how tools are described to the worker", () => {
  test("a read tool is read; a draft or submit tool is write; none is outside or money", () => {
    assert.equal(riskOf("read"), "read");
    assert.equal(riskOf("draft"), "write");
    assert.equal(riskOf("submit"), "write");
    for (const t of availableTools(ctx())) assert.ok(["read", "write"].includes(toGatewayTool(t).risk), t.name);
  });
  test("arguments come from the tool's JSON schema: names, kinds, required", () => {
    const search = gatewayTools(ctx()).find((t) => t.name === "search_content")!;
    const byName = Object.fromEntries(search.args.map((a) => [a.name, a]));
    assert.deepEqual(search.args.map((a) => a.name).sort(), ["limit", "q", "uid"]);
    assert.deepEqual([byName.uid.kind, byName.uid.required, byName.limit.kind, byName.limit.required, byName.q.required], ["text", true, "number", false, false]);
  });
  test("every tool Studio can offer converts, with a name and a help text", () => {
    const all = gatewayTools(ctx());
    assert.ok(all.length >= 10);
    for (const t of all) assert.ok(t.name && t.help, JSON.stringify(t));
  });
});

describe("what is offered follows the owner's policy", () => {
  test("level off offers nothing; read offers only read tools; draft adds write tools", () => {
    assert.equal(gatewayTools(ctx({ level: "off" })).length, 0);
    const read = gatewayTools(ctx({ level: "read" }));
    assert.ok(read.length > 0 && read.every((t) => t.risk === "read"));
    const draft = gatewayTools(ctx({ level: "draft" }));
    assert.ok(draft.some((t) => t.risk === "write") && draft.length > read.length);
  });
  test("the tenant's tool allow-list cuts the list", () => {
    const names = gatewayTools(ctx({ allowedTools: ["search_content"] })).map((t) => t.name);
    assert.deepEqual(names, ["search_content"]);
  });
  test("ctxForOwner carries the owner's identity, tenant and policy into the run context", () => {
    const owner = { user: { id: 7, email: "ann@example.org", roles: [], isSuperAdmin: false } as any, lang: "th" as const,
      policy: { level: "read" as const, tools: ["get_entry"], contentTypes: ["api::faq.faq"], model: "m", dialect: "orst", engine: "wordpress" as const, tenantKey: "orst" } };
    const c = ctxForOwner(owner, parseGatewayJob(goodJob) as any);
    assert.deepEqual([c.tenantKey, c.level, c.allowedTools, c.allowedContentTypes, c.lang, c.dialect, c.engine, c.user.email, c.runId], ["orst", "read", ["get_entry"], ["api::faq.faq"], "th", "orst", "wordpress", "ann@example.org", "job-1"]);
  });
});

describe("running a tool", () => {
  const fc = () => fakeCms([{ uid: "api::faq.faq", name: "FAQ", attributes: { title: { type: "string" } } }], { "api::faq.faq": [{ documentId: "f1", title: "Opening hours" }] });
  test("goes through the tools' own enforcement: a tool above the owner's level is refused", async () => {
    const r = await runGatewayTool(ctx({ level: "read", cms: fc().cms }), "create_draft_entry", { uid: "api::faq.faq", fields: { title: "x" } });
    assert.equal(r.ok, false);
    assert.match(r.text, /higher autonomy level/);
  });
  test("a read tool returns its summary and data as text", async () => {
    const r = await runGatewayTool(ctx({ level: "read", cms: fc().cms }), "get_entry", { uid: "api::faq.faq", id: "f1" });
    assert.equal(r.ok, true);
    assert.match(r.text, /Opening hours/);
  });
  test("an unknown tool and bad arguments are refused with a sentence the model can use", async () => {
    assert.match((await runGatewayTool(ctx({ cms: fc().cms }), "frobnicate", {})).text, /Unknown tool/);
    const bad = await runGatewayTool(ctx({ cms: fc().cms }), "get_entry", {});
    assert.equal(bad.ok, false);
    assert.match(bad.text, /Invalid arguments/);
  });
});

describe("gatewayAuthorized", () => {
  test("needs the exact bearer secret, and is off without one", () => {
    assert.equal(gatewayAuthorized("Bearer s3cret", "s3cret"), true);
    assert.equal(gatewayAuthorized("Bearer s3cret!", "s3cret"), false);
    assert.equal(gatewayAuthorized("Bearer nope", "s3cret"), false);
    assert.equal(gatewayAuthorized("s3cret", "s3cret"), false, "a bare value is not a bearer token");
    assert.equal(gatewayAuthorized(null, "s3cret"), false);
    assert.equal(gatewayAuthorized("Bearer ", ""), false, "no secret configured: the gateway is off");
    assert.equal(gatewayAuthorized("Bearer undefined", undefined), false);
  });
});
