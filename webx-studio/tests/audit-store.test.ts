// The control-plane audit store (lib/cms/audit-store.ts, track C3).
// Unit tests use a fake fetch. The same file runs against a real webx-control
// when AUDIT_CONTROL_URL and AUDIT_CONTROL_TOKEN are set (webx-control/tools/audit-test.mjs does that).
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { auditQueryString, controlAuditConfig, createControlAuditAdapter } from "../lib/cms/audit-store";
import { CmsError } from "../lib/cms/types";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body?: any }) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = handler(String(url), init);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

describe("controlAuditConfig", () => {
  it("is on only when both the address and the token are set", () => {
    assert.equal(controlAuditConfig({}), null);
    assert.equal(controlAuditConfig({ WEBX_CONTROL_URL: "http://c:1400" }), null);
    assert.equal(controlAuditConfig({ WEBX_CONTROL_SERVICE_TOKEN: "t" }), null);
    assert.deepEqual(controlAuditConfig({ WEBX_CONTROL_URL: "http://c:1400/", WEBX_CONTROL_SERVICE_TOKEN: "t" }), { baseUrl: "http://c:1400", token: "t" });
  });
});

describe("auditQueryString", () => {
  it("turns an EntryQuery into the control plane's parameters", () => {
    const qs = auditQueryString({
      filter: [{ field: "tenantKey", op: "eq", value: "dga" }, { field: "at", op: "gte", value: "2026-11-01T00:00:00.000Z" }],
      sort: "at:desc", q: " role ", page: 2, pageSize: 50,
    });
    const p = new URLSearchParams(qs.slice(1));
    assert.deepEqual(p.getAll("filter"), ["tenantKey:eq:dga", "at:gte:2026-11-01T00:00:00.000Z"]);
    assert.equal(p.get("sort"), "at:desc");
    assert.equal(p.get("q"), "role");
    assert.equal(p.get("page"), "2");
    assert.equal(p.get("pageSize"), "50");
    assert.equal(auditQueryString(), "");
  });
});

describe("control audit adapter (fake control plane)", () => {
  const cfg = { baseUrl: "http://control:1400", token: "svc" };

  it("create posts the row with the service token", async () => {
    const calls = fakeFetch(() => ({ body: { data: { documentId: "d1", action: "signup" } } }));
    const row = await createControlAuditAdapter(cfg).entries.create("api::audit-log.audit-log", { action: "signup", tenantKey: "dga" });
    assert.equal(row.documentId, "d1");
    assert.equal(calls[0].url, "http://control:1400/internal/audit");
    assert.equal(calls[0].init.method, "POST");
    assert.equal((calls[0].init.headers as any).Authorization, "Bearer svc");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { data: { action: "signup", tenantKey: "dga" } });
  });

  it("list maps the pagination to total and pageCount", async () => {
    fakeFetch(() => ({ body: { data: [{ id: 1 }], meta: { pagination: { page: 1, pageSize: 1, pageCount: 4, total: 4 } } } }));
    const r = await createControlAuditAdapter(cfg).entries.list("x", { pageSize: 1 });
    assert.deepEqual([r.data.length, r.total, r.pageCount], [1, 4, 4]);
  });

  it("the log is append-only: update and remove refuse with 405 before any request", async () => {
    const calls = fakeFetch(() => ({}));
    const a = createControlAuditAdapter(cfg);
    for (const fn of [() => a.entries.update("x", "id", {}), () => a.entries.remove("x", "id")]) {
      assert.throws(fn, (e) => e instanceof CmsError && e.status === 405);
    }
    assert.equal(calls.length, 0);
  });

  it("errors carry the status and the control plane's message", async () => {
    fakeFetch(() => ({ status: 401, body: { error: { message: "Missing or invalid token" } } }));
    await assert.rejects(createControlAuditAdapter(cfg).entries.list("x"), (e: any) => e instanceof CmsError && e.status === 401 && /invalid token/.test(e.message));
  });
});

const url = process.env.AUDIT_CONTROL_URL || "";
const token = process.env.AUDIT_CONTROL_TOKEN || "";
describe("control audit adapter (real webx-control)", { skip: url && token ? undefined : "set AUDIT_CONTROL_URL and AUDIT_CONTROL_TOKEN" }, () => {
  const a = createControlAuditAdapter({ baseUrl: url, token });
  const tag = `t${Date.now().toString(36)}`;
  const UID = "api::audit-log.audit-log";

  it("a written row is read back in Strapi's shape, scoped and counted by tenant", async () => {
    const at = new Date().toISOString();
    for (const [tenantKey, action, tokens] of [[`${tag}a`, "agent_run", undefined], [`${tag}a`, "agent_run_usage", 40], [`${tag}a`, "agent_run_usage", 2], [`${tag}b`, "agent_run", undefined]] as const) {
      await a.entries.create(UID, { action, contentType: "agent", entryId: "r1", adminEmail: "e@x", tenantKey, at, actor: "agent", targetRef: "r1", ...(tokens ? { tokens } : {}) });
    }
    const runs = await a.entries.list<any>(UID, { pageSize: 1, filter: [
      { field: "tenantKey", op: "eq", value: `${tag}a` }, { field: "action", op: "eq", value: "agent_run" }, { field: "at", op: "gte", value: at }] });
    assert.equal(runs.total, 1, "the run count is per tenant");
    const usage = await a.entries.list<any>(UID, { pageSize: 500, filter: [{ field: "tenantKey", op: "eq", value: `${tag}a` }, { field: "createdAt", op: "gte", value: at.slice(0, 10) }] });
    assert.equal(usage.data.reduce((s, r) => s + (Number(r.tokens) || 0), 0), 42, "the token sum governance computes");
    const one = await a.entries.get<any>(UID, runs.data[0].documentId);
    assert.deepEqual([one?.action, one?.tenantKey, one?.adminEmail], ["agent_run", `${tag}a`, "e@x"]);
  });

  it("an unknown row is a 404 and a wrong token is a 401", async () => {
    await assert.rejects(a.entries.get(UID, "nosuchrow"), (e: any) => e instanceof CmsError && e.status === 404);
    await assert.rejects(createControlAuditAdapter({ baseUrl: url, token: "wrong" }).entries.list(UID), (e: any) => e instanceof CmsError && e.status === 401);
  });
});
