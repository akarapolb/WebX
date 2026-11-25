// Search insights' two sources (lib/cms/stat-merge.ts, track C5): the engine's per-query counts and the control plane's,
// added up per query. Unit tests use fake list functions that behave like Strapi's (page and pageSize, at most 100 a page).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { controlStatQuery, mergedStats, READ_DEPTH, tenantKeyOf } from "../lib/cms/stat-merge";
import type { ListFn } from "../lib/cms/consent-merge";
import type { EntryQuery } from "../lib/cms/types";

type Row = { documentId: string; query: string; locale?: string; count: number; results?: number; zeroCount?: number; lastAt?: string; tenantKey?: string };
const T1 = "2026-11-20T10:00:00.000Z", T2 = "2026-11-25T10:00:00.000Z";
const row = (documentId: string, query: string, count: number, extra: Partial<Row> = {}): Row => ({ documentId, query, locale: "th", count, results: 1, zeroCount: 0, lastAt: T1, ...extra });

function source(all: Row[], limit = 100) {
  const calls: EntryQuery[] = [];
  const list: ListFn<Row> = async (q) => {
    calls.push(q);
    const [f, d = "asc"] = (q.sort || "count:DESC").split(":");
    const sorted = [...all].sort((a: any, b: any) => (d.toLowerCase() === "desc" ? -1 : 1) * (a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0));
    const size = Math.min(q.pageSize ?? 25, limit);
    const page = q.page ?? 1;
    return { data: sorted.slice((page - 1) * size, page * size), total: all.length, pageCount: Math.ceil(all.length / size) };
  };
  return { list, calls };
}

describe("mergedStats", () => {
  it("adds up a query both sources hold: counts summed, the newer row's result count and time kept", async () => {
    const own = source([row("e1", "open data", 3, { zeroCount: 1, results: 5, lastAt: T1 })]);
    const ctl = source([row("c1", "open data", 2, { zeroCount: 0, results: 9, lastAt: T2 })]);
    const r = await mergedStats(own.list, ctl.list, { pageSize: 50 }, true);
    assert.equal(r.data.length, 1);
    assert.deepEqual([r.data[0].count, r.data[0].zeroCount, r.data[0].results, r.data[0].lastAt], [5, 1, 9, T2]);
    assert.equal(r.total, 1);
  });

  it("keeps the engine's result count when its row is the newer one", async () => {
    const own = source([row("e1", "budget", 1, { results: 4, lastAt: T2 })]);
    const ctl = source([row("c1", "budget", 1, { results: 0, zeroCount: 1, lastAt: T1 })]);
    const r = await mergedStats(own.list, ctl.list, {}, true);
    assert.deepEqual([r.data[0].count, r.data[0].results, r.data[0].zeroCount, r.data[0].lastAt], [2, 4, 1, T2]);
  });

  it("keeps each language and each different query apart, most searched first", async () => {
    const own = source([row("e1", "tax", 1), row("e2", "tax", 7, { locale: "en" })]);
    const ctl = source([row("c1", "tax", 4), row("c2", "visa", 2)]);
    const r = await mergedStats(own.list, ctl.list, {}, true);
    assert.deepEqual(r.data.map((x) => [x.query, x.locale, x.count]), [["tax", "en", 7], ["tax", "th", 5], ["visa", "th", 2]]);
  });

  it("does not add up rows of different workspaces when the list is not one workspace's", async () => {
    const own = source([row("e1", "tax", 1)]);
    const ctl = source([row("c1", "tax", 4, { tenantKey: "pea" }), row("c2", "tax", 2, { tenantKey: "dga" }), row("c3", "tax", 3, { tenantKey: "pea" })]);
    const r = await mergedStats(own.list, ctl.list, {}, false);
    assert.deepEqual(r.data.map((x) => [x.tenantKey ?? "", x.count]).sort(), [["", 1], ["dga", 2], ["pea", 7]], "pea's two rows are one; the engine's rows do not say which workspace they are");
  });

  it("sorts by the query's own sort and pages the merged result", async () => {
    const own = source([row("e1", "b", 1), row("e2", "d", 1)]);
    const ctl = source([row("c1", "a", 1), row("c2", "c", 1)]);
    const p1 = await mergedStats(own.list, ctl.list, { sort: "query:ASC", page: 1, pageSize: 3 }, true);
    assert.deepEqual(p1.data.map((x) => x.query), ["a", "b", "c"]);
    const p2 = await mergedStats(own.list, ctl.list, { sort: "query:ASC", page: 2, pageSize: 3 }, true);
    assert.deepEqual(p2.data.map((x) => x.query), ["d"]);
    assert.equal(p2.total, 4);
    assert.equal(p2.pageCount, 2);
  });

  it("reads each source a chunk of 100 at a time and stops when it has run out", async () => {
    const own = source(Array.from({ length: 250 }, (_, i) => row("e" + i, "q" + i, 1000 - i)));
    const ctl = source([row("c0", "only", 5)]);
    const r = await mergedStats(own.list, ctl.list, { pageSize: 500 }, true);
    assert.equal(r.total, 251);
    assert.equal(r.data.length, 251);
    assert.deepEqual(own.calls.map((c) => [c.page, c.pageSize]), [[1, 100], [2, 100], [3, 100]]);
    assert.equal(ctl.calls.length, 1);
  });

  it("reads at most READ_DEPTH rows of a source, its top ones by the sort", async () => {
    const own = source(Array.from({ length: READ_DEPTH + 300 }, (_, i) => row("e" + i, "q" + i, 5000 - i)));
    const ctl = source([]);
    const r = await mergedStats(own.list, ctl.list, { pageSize: 10 }, true);
    assert.equal(r.total, READ_DEPTH, "the long tail is left out");
    assert.equal(r.data[0].query, "q0");
    assert.equal(own.calls.length, READ_DEPTH / 100);
  });
});

describe("controlStatQuery", () => {
  it("keeps the filters the control plane understands and scopes by workspace key instead of the engine's relation", () => {
    const q = controlStatQuery({ sort: "count:DESC", pageSize: 500, filter: [{ field: "tenant.key", op: "eq", value: "dga" }, { field: "locale", op: "eq", value: "th" }, { field: "query", op: "contains", value: "tax" }, { field: "count", op: "gte", value: 3 }, { field: "tenantKey", op: "eq", value: "dga" }] }, "pea");
    assert.deepEqual(q.filter, [{ field: "locale", op: "eq", value: "th" }, { field: "query", op: "contains", value: "tax" }, { field: "tenantKey", op: "eq", value: "pea" }], "a client-supplied workspace cannot widen the scope");
    assert.equal(q.sort, "count:DESC");
    assert.equal(q.pageSize, 500);
  });
  it("adds no workspace filter when none applies", () => {
    assert.deepEqual(controlStatQuery({ filter: [{ field: "locale", op: "eq", value: "en" }] }, null).filter, [{ field: "locale", op: "eq", value: "en" }]);
    assert.deepEqual(controlStatQuery(undefined, null).filter, []);
  });
});

describe("tenantKeyOf", () => {
  it("is the workspace a page asked the engine for", () => {
    assert.equal(tenantKeyOf({ filter: [{ field: "tenant.key", op: "eq", value: "pea" }] }), "pea");
    assert.equal(tenantKeyOf({ filter: [{ field: "locale", op: "eq", value: "th" }] }), null);
    assert.equal(tenantKeyOf(undefined), null);
  });
});
