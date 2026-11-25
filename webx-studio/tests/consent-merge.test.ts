// The Cookie Consent page's two sources (lib/cms/consent-merge.ts, track C5): the engine's own rows and the
// control plane's, listed as one. Unit tests use fake list functions that behave like Strapi's (page and pageSize,
// at most 100 a page) and like webx-control's.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { controlConsentQuery, DEEPEST, mergedList, type ListFn } from "../lib/cms/consent-merge";
import { CONTROL_READ_COLLECTIONS, CONTROL_RECORD_COLLECTIONS, createControlRecordsAdapter } from "../lib/cms/records-store";
import { CmsError, type EntryQuery } from "../lib/cms/types";

type Row = { documentId: string; createdAt: string; action?: string };
const at = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 60_000).toISOString();
const rows = (prefix: string, minutes: number[]): Row[] => minutes.map((m, i) => ({ documentId: `${prefix}${i}`, createdAt: at(m) }));

/** A source that sorts by createdAt as asked and pages like an engine, and records the calls it got. */
function source(all: Row[], limit = 100) {
  const calls: EntryQuery[] = [];
  const list: ListFn<Row> = async (q) => {
    calls.push(q);
    const dir = (q.sort || "createdAt:DESC").endsWith(":ASC") ? 1 : -1;
    const sorted = [...all].sort((a, b) => dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt)));
    const size = Math.min(q.pageSize ?? 25, limit);
    const page = q.page ?? 1;
    return { data: sorted.slice((page - 1) * size, page * size), total: all.length, pageCount: Math.ceil(all.length / size) };
  };
  return { list, calls };
}

describe("mergedList", () => {
  it("puts both sources' rows in one list, newest first, and adds the totals", async () => {
    const own = source(rows("e", [1, 4, 7]));
    const ctl = source(rows("c", [2, 5, 8, 9]));
    const r = await mergedList(own.list, ctl.list, { pageSize: 50 });
    assert.deepEqual(r.data.map((x) => x.documentId), ["c3", "c2", "e2", "c1", "e1", "c0", "e0"]);
    assert.equal(r.total, 7);
    assert.equal(r.pageCount, 1);
  });

  it("cuts the requested page from the merged order, not from each source's", async () => {
    const own = source(rows("e", [10, 30, 50, 70]));
    const ctl = source(rows("c", [20, 40, 60, 80]));
    const p2 = await mergedList(own.list, ctl.list, { page: 2, pageSize: 3 });
    // merged newest first: 80 70 60 | 50 40 30 | 20 10
    assert.deepEqual(p2.data.map((x) => x.createdAt), [at(50), at(40), at(30)]);
    assert.equal(p2.total, 8);
    assert.equal(p2.pageCount, 3);
    const p3 = await mergedList(own.list, ctl.list, { page: 3, pageSize: 3 });
    assert.deepEqual(p3.data.map((x) => x.createdAt), [at(20), at(10)]);
  });

  it("reads each source in chunks of 100 as far down as the page reaches", async () => {
    const own = source(rows("e", Array.from({ length: 250 }, (_, i) => i * 2)));
    const ctl = source(rows("c", Array.from({ length: 250 }, (_, i) => i * 2 + 1)));
    const r = await mergedList(own.list, ctl.list, { page: 1, pageSize: 200 });
    assert.equal(r.data.length, 200);
    assert.equal(r.data[0].createdAt, at(499), "the newest of the 500 rows is first");
    assert.equal(r.data[199].createdAt, at(300));
    assert.equal(r.total, 500);
    assert.deepEqual(own.calls.map((c) => [c.page, c.pageSize]), [[1, 100], [2, 100]], "two chunks, not 250 rows in one call");
  });

  it("stops reading a source that has run out", async () => {
    const own = source(rows("e", [1, 2]));
    const ctl = source([]);
    const r = await mergedList(own.list, ctl.list, { pageSize: 25 });
    assert.equal(r.data.length, 2);
    assert.equal(own.calls.length, 1);
    assert.equal(ctl.calls.length, 1);
  });

  it("sorts oldest first when the query asks for it", async () => {
    const own = source(rows("e", [5, 1]));
    const ctl = source(rows("c", [3]));
    const r = await mergedList(own.list, ctl.list, { sort: "createdAt:ASC", pageSize: 10 });
    assert.deepEqual(r.data.map((x) => x.createdAt), [at(1), at(3), at(5)]);
  });

  it("refuses a page that reaches deeper than it can read exactly", async () => {
    const own = source([]);
    await assert.rejects(() => mergedList(own.list, own.list, { page: DEEPEST / 25 + 1, pageSize: 25 }), (e: any) => e instanceof CmsError && e.status === 400);
    await mergedList(own.list, own.list, { page: DEEPEST / 25, pageSize: 25 }); // exactly the limit is fine
  });

  it("does not hide a source that fails: the error comes through", async () => {
    const own = source(rows("e", [1]));
    const broken: ListFn<Row> = async () => { throw new CmsError("records GET failed", 502); };
    await assert.rejects(() => mergedList(own.list, broken, {}), (e: any) => e.status === 502);
  });
});

describe("controlConsentQuery", () => {
  it("scopes the control plane's rows by workspace key and keeps only the filters it understands", () => {
    const q = controlConsentQuery({ sort: "createdAt:DESC", page: 2, pageSize: 50, filter: [{ field: "tenant.id", op: "eq", value: 9 }, { field: "tenantKey", op: "eq", value: "dga" }, { field: "createdAt", op: "gte", value: "2026-11-01T00:00:00.000Z" }] }, "pea");
    assert.deepEqual(q.filter, [{ field: "createdAt", op: "gte", value: "2026-11-01T00:00:00.000Z" }, { field: "tenantKey", op: "eq", value: "pea" }], "the relation filter is dropped and a client-supplied workspace cannot widen the scope");
    assert.equal(q.sort, "createdAt:DESC");
    assert.equal(q.page, 2);
  });
  it("adds no workspace filter for an unscoped caller", () => {
    assert.deepEqual(controlConsentQuery({ filter: [{ field: "action", op: "eq", value: "reject" }] }, null).filter, [{ field: "action", op: "eq", value: "reject" }]);
    assert.deepEqual(controlConsentQuery(undefined, null).filter, []);
  });
  it("drops a client-supplied workspace filter even for an unscoped caller", () => {
    assert.deepEqual(controlConsentQuery({ filter: [{ field: "tenantKey", op: "eq", value: "dga" }] }, null).filter, []);
  });
});

describe("the consent log in the control plane's collections", () => {
  it("is read from there next to the engine's rows, not switched like the types that moved", () => {
    assert.deepEqual(CONTROL_READ_COLLECTIONS, {
      "api::consent-log.consent-log": "consent-log", "api::search-stat.search-stat": "search-stat",
      "api::complaint.complaint": "complaint", "api::application.application": "application", "api::registration.registration": "registration", "api::contact-message.contact-message": "contact-message",
    });
    assert.equal(CONTROL_RECORD_COLLECTIONS["api::consent-log.consent-log"], undefined, "writes and the engine's old rows stay where they are");
    assert.equal(CONTROL_RECORD_COLLECTIONS["api::search-stat.search-stat"], undefined);
  });
  it("is reachable through an adapter made for the read-only map, and not through the default one", async () => {
    const realFetch = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = (async (url: any) => { seen.push(String(url)); return new Response(JSON.stringify({ data: [], meta: { pagination: { total: 0, pageCount: 0 } } })); }) as typeof fetch;
    try {
      const cfg = { baseUrl: "http://c:1400", token: "t" };
      await createControlRecordsAdapter(cfg, CONTROL_READ_COLLECTIONS).entries.list("api::consent-log.consent-log", { filter: [{ field: "tenantKey", op: "eq", value: "pea" }], sort: "createdAt:DESC" });
      assert.equal(seen[0], "http://c:1400/internal/records/consent-log?filter=tenantKey%3Aeq%3Apea&sort=createdAt%3ADESC");
      await assert.rejects(() => createControlRecordsAdapter(cfg).entries.list("api::consent-log.consent-log"), (e: any) => e.status === 501);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
