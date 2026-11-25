// The control-plane records store (lib/cms/records-store.ts, track C3): custom
// roles, page templates and page versions. Unit tests use a fake fetch. The same
// file runs against a real webx-control when AUDIT_CONTROL_URL and
// AUDIT_CONTROL_TOKEN are set (webx-control/tools/audit-test.mjs does that).
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CONTROL_RECORD_COLLECTIONS, createControlRecordsAdapter } from "../lib/cms/records-store";
import { CmsError } from "../lib/cms/types";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const ROLE = "api::custom-role.custom-role";
const TEMPLATE = "api::page-template.page-template";
const VERSION = "api::page-version.page-version";

describe("the collections", () => {
  it("are the content types moved so far, by their control-plane names", () => {
    assert.deepEqual(CONTROL_RECORD_COLLECTIONS, {
      [TEMPLATE]: "page-template", [VERSION]: "page-version", "api::agent-thread.agent-thread": "agent-thread",
      "api::review.review": "review", "api::release.release": "release",
    });
  });
  it("leave out custom roles, which Strapi's and WordPress's own enforcement still read from Strapi", () => {
    assert.equal(CONTROL_RECORD_COLLECTIONS[ROLE], undefined);
  });
});

describe("createControlRecordsAdapter (fake fetch)", () => {
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

  it("sends each call to the content type's collection with the service token", async () => {
    const calls = fake((m) => ({ body: m === "GET" ? { data: [{ id: 1 }], meta: { pagination: { total: 1, pageCount: 1 } } } : { data: { documentId: "d1" } } }));
    const a = createControlRecordsAdapter(cfg);
    const list = await a.entries.list(TEMPLATE, { pageSize: 500, filter: [{ field: "tenantKey", op: "eq", value: "dga" }] });
    assert.deepEqual([list.total, list.data.length], [1, 1]);
    await a.entries.create(TEMPLATE, { key: "t", tenantKey: "dga" });
    await a.entries.update(VERSION, "d 1", { label: "x" });
    await a.entries.remove(TEMPLATE, "d1");
    assert.deepEqual(calls.map((c) => [c.method, c.url.replace("http://c:1400/internal/records/", "")]), [
      ["GET", "page-template?filter=tenantKey%3Aeq%3Adga&pageSize=500"],
      ["POST", "page-template"],
      ["PUT", "page-version/d%201"],
      ["DELETE", "page-template/d1"],
    ]);
    assert.ok(calls.every((c) => c.auth === "Bearer tok"));
    assert.deepEqual(calls[1].body, { data: { key: "t", tenantKey: "dga" } });
  });

  it("refuses a content type that is not stored there, without calling out", async () => {
    const calls = fake(() => ({}));
    await assert.rejects(createControlRecordsAdapter(cfg).entries.list(ROLE), (e: any) => e instanceof CmsError && e.status === 501);
    assert.equal(calls.length, 0);
  });

  it("turns an error answer into a CmsError with its status", async () => {
    fake(() => ({ status: 404, body: { error: { message: "Not Found" } } }));
    await assert.rejects(createControlRecordsAdapter(cfg).entries.get(TEMPLATE, "nope"), (e: any) => e instanceof CmsError && e.status === 404);
  });
});

const URL_ = process.env.AUDIT_CONTROL_URL;
const TOKEN = process.env.AUDIT_CONTROL_TOKEN;
describe("against a real webx-control", { skip: !URL_ || !TOKEN }, () => {
  const a = () => createControlRecordsAdapter({ baseUrl: URL_!, token: TOKEN! });

  it("creates, reads, filters, updates and deletes a page template", async () => {
    const tag = "real_" + Date.now();
    const made: any = await a().entries.create(TEMPLATE, { tenantKey: tag, key: "lite", name: "Lite", blocks: [{ type: "hero" }] });
    assert.equal(made.tenantKey, tag);
    assert.deepEqual(made.blocks, [{ type: "hero" }]);
    const listed = await a().entries.list<any>(TEMPLATE, { filter: [{ field: "tenantKey", op: "eq", value: tag }], pageSize: 10 });
    assert.equal(listed.total, 1);
    const upd: any = await a().entries.update(TEMPLATE, made.documentId, { name: "Lighter" });
    assert.equal(upd.name, "Lighter");
    assert.equal(upd.key, "lite", "the other fields stay");
    assert.equal(((await a().entries.get<any>(TEMPLATE, made.documentId))!).name, "Lighter");
    await a().entries.remove(TEMPLATE, made.documentId);
    await assert.rejects(a().entries.get(TEMPLATE, made.documentId), (e: any) => e.status === 404);
  });

  it("keeps collections apart and refuses ones it does not serve", async () => {
    const tag = "real_" + Date.now();
    const t: any = await a().entries.create(TEMPLATE, { tenantKey: tag, key: "k", name: "T", blocks: [{ type: "hero" }] });
    await assert.rejects(a().entries.get(VERSION, t.documentId), (e: any) => e.status === 404);
    await a().entries.remove(TEMPLATE, t.documentId);
    const r = await fetch(`${URL_}/internal/records/menu-item`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(r.status, 404);
  });
});
