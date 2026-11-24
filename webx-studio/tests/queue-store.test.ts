// The control-plane queue store (lib/cms/queue-store.ts, track C5): background jobs
// and schedules. Unit tests use a fake fetch; the lease and tick calls are checked
// for their routes, and the real webx-control runs them in
// webx-control/tools/jobs-test.mjs.
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { controlQueueConfig, controlQueueRoute, createControlQueueAdapter, QUEUE_COLLECTIONS } from "../lib/cms/queue-store";
import { CmsError } from "../lib/cms/types";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const JOB = "api::agent-job.agent-job";
const SCHEDULE = "api::agent-schedule.agent-schedule";

describe("the switch", () => {
  const base = { WEBX_CONTROL_URL: "http://c:1400/", WEBX_CONTROL_SERVICE_TOKEN: "tok" };
  it("is off unless WEBX_CONTROL_QUEUE is set, so the audit switch alone never moves live work", () => {
    assert.equal(controlQueueConfig(base), null);
    assert.equal(controlQueueConfig({ ...base, WEBX_CONTROL_QUEUE: "0" }), null);
  });
  it("needs the control plane's address and token too", () => {
    assert.equal(controlQueueConfig({ WEBX_CONTROL_QUEUE: "1" }), null);
    assert.deepEqual(controlQueueConfig({ ...base, WEBX_CONTROL_QUEUE: "1" }), { baseUrl: "http://c:1400", token: "tok" });
    assert.ok(controlQueueConfig({ ...base, WEBX_CONTROL_QUEUE: "true" }));
  });
  it("covers jobs and schedules", () => {
    assert.deepEqual(QUEUE_COLLECTIONS, { [JOB]: "jobs", [SCHEDULE]: "schedules" });
  });
});

describe("the worker and tick routes", () => {
  it("map Strapi's internal paths to the control plane's", () => {
    assert.deepEqual(controlQueueRoute("agent-jobs/claim"), { method: "POST", path: "jobs/claim" });
    assert.deepEqual(controlQueueRoute("agent-jobs/heartbeat"), { method: "POST", path: "jobs/heartbeat" });
    assert.deepEqual(controlQueueRoute("agent-jobs/control"), { method: "POST", path: "jobs/control" });
    assert.deepEqual(controlQueueRoute("agent-schedules/due"), { method: "GET", path: "schedules/due" });
    assert.deepEqual(controlQueueRoute("agent-schedules/advance"), { method: "POST", path: "schedules/advance" });
    assert.deepEqual(controlQueueRoute("agent-schedules/disable"), { method: "POST", path: "schedules/disable" });
  });
  it("refuse a path they do not know", () => {
    assert.throws(() => controlQueueRoute("tenants/list"), CmsError);
    assert.throws(() => controlQueueRoute("agent-jobs"), CmsError);
  });
});

describe("createControlQueueAdapter (fake fetch)", () => {
  const cfg = { baseUrl: "http://c:1400", token: "tok" };
  function fake(handler: (method: string, url: string, body: any) => { status?: number; body?: any }) {
    const calls: { method: string; url: string; body: any; auth: string }[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ method: init.method, url: String(url), body, auth: init.headers.Authorization });
      const r = handler(init.method, String(url), body);
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
    }) as typeof fetch;
    return calls;
  }

  it("lists jobs with Studio's filters as the control plane reads them", async () => {
    const calls = fake(() => ({ body: { data: [{ documentId: "j1" }], meta: { pagination: { total: 7, pageCount: 1 } } } }));
    const r = await createControlQueueAdapter(cfg).entries.list(JOB, {
      filter: [{ field: "tenantKey", op: "eq", value: "dga" }, { field: "createdAt", op: "gte", value: "2026-11-01T00:00:00.000Z" }],
      sort: "createdAt:DESC", pageSize: 100,
    });
    assert.equal(r.total, 7);
    assert.equal(calls[0].method, "GET");
    assert.ok(calls[0].url.startsWith("http://c:1400/internal/jobs?"));
    assert.ok(calls[0].url.includes(encodeURIComponent("filter=")) === false);
    const qs = decodeURIComponent(calls[0].url.split("?")[1]);
    assert.ok(qs.includes("filter=tenantKey:eq:dga") && qs.includes("filter=createdAt:gte:2026-11-01T00:00:00.000Z") && qs.includes("sort=createdAt:DESC") && qs.includes("pageSize=100"));
    assert.equal(calls[0].auth, "Bearer tok");
  });

  it("creates a job and a schedule in their own collections", async () => {
    const calls = fake(() => ({ body: { data: { documentId: "d1" } } }));
    const a = createControlQueueAdapter(cfg);
    await a.entries.create(JOB, { tenantKey: "dga", ownerEmail: "a@x.org" });
    await a.entries.create(SCHEDULE, { tenantKey: "dga", ownerEmail: "a@x.org" });
    assert.deepEqual(calls.map((c) => [c.method, c.url]), [["POST", "http://c:1400/internal/jobs"], ["POST", "http://c:1400/internal/schedules"]]);
    assert.deepEqual(calls[0].body, { data: { tenantKey: "dga", ownerEmail: "a@x.org" } });
  });

  it("answers null for a job that does not exist", async () => {
    fake(() => ({ status: 404, body: { error: { message: "not found" } } }));
    assert.equal(await createControlQueueAdapter(cfg).entries.get(JOB, "nope"), null);
  });

  it("changes and deletes schedules, but never a job (a job moves only through its lease and the control actions)", async () => {
    const calls = fake(() => ({ body: { data: {} } }));
    const a = createControlQueueAdapter(cfg);
    await a.entries.update(SCHEDULE, "s1", { name: "New" });
    await a.entries.remove(SCHEDULE, "s1");
    assert.deepEqual(calls.map((c) => [c.method, c.url]), [["PUT", "http://c:1400/internal/schedules/s1"], ["DELETE", "http://c:1400/internal/schedules/s1"]]);
    await assert.rejects(() => a.entries.update(JOB, "j1", { runState: "done" }), (e: any) => e instanceof CmsError && e.status === 405);
    await assert.rejects(() => a.entries.remove(JOB, "j1"), (e: any) => e instanceof CmsError && e.status === 405);
  });

  it("refuses another content type, and surfaces a failure's message", async () => {
    fake(() => ({ status: 400, body: { error: { message: "tenantKey is required" } } }));
    const a = createControlQueueAdapter(cfg);
    await assert.rejects(() => a.entries.list("api::page.page"), (e: any) => e instanceof CmsError && e.status === 501);
    await assert.rejects(() => a.entries.create(JOB, {}), (e: any) => e instanceof CmsError && e.status === 400 && /tenantKey is required/.test(e.message));
  });
});
