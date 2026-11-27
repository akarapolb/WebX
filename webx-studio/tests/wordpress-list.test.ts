// The WordPress adapter's list (lib/cms/wordpress.ts): the tenant goes as WordPress's own wtenant filter, every other
// filter as webx_filter, and a sort WordPress has no orderby for as webx_sort, which
// wordpress/mu-plugins/webx-list-filters.php applies (the engine conformance suite's WordPress run checks that end to end).
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

const WORDPRESS = "http://wp.test/wp-json";
let calls: string[] = [];
const realFetch = globalThis.fetch;
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
async function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(url);
  if (url.includes("/wp/v2/wtenant")) return json([{ id: 6, slug: "orst" }, { id: 7, slug: "royalsociety" }]);
  return json([], { "X-WP-Total": "0", "X-WP-TotalPages": "1" });
}

let wp: typeof import("../lib/cms/wordpress");
let strapi: typeof import("../lib/strapi");
before(async () => {
  process.env.WORDPRESS_URL = WORDPRESS;
  globalThis.fetch = fakeFetch as typeof fetch;
  wp = await import("../lib/cms/wordpress");
  strapi = await import("../lib/strapi");
});
after(() => { globalThis.fetch = realFetch; });
beforeEach(() => { calls = []; });

type Query = Parameters<typeof import("../lib/cms/wordpress")["wordpressAdapter"]["entries"]["list"]>[1];
async function listed(q: Query): Promise<URLSearchParams> {
  await strapi.withServiceToken("dXNlcjphcHA=", () => wp.wordpressAdapter.entries.list("wp:timeline", q));
  const url = calls.find((u) => u.startsWith(WORDPRESS + "/wp/v2/timeline-event?"));
  assert.ok(url, `no list request among ${JSON.stringify(calls)}`);
  return new URL(url).searchParams;
}

describe("the WordPress adapter's list", () => {
  it("sends the tenant as wtenant and every other filter, as given, as webx_filter", async () => {
    const p = await listed({
      filter: [
        { field: "tenant.key", op: "eq", value: "orst" },
        { field: "title", op: "contains", value: "conf-list-" },
        { field: "order", op: "gte", value: 2 },
      ],
    });
    assert.equal(p.get("wtenant"), "6");
    assert.deepEqual(JSON.parse(p.get("webx_filter") ?? "null"), [
      { field: "title", op: "contains", value: "conf-list-" },
      { field: "order", op: "gte", value: 2 },
    ]);
  });

  it("sends no webx_filter when the tenant is the only filter, and an unknown tenant lists nothing", async () => {
    let p = await listed({ filter: [{ field: "tenant.key", op: "eq", value: "royalsociety" }] });
    assert.equal(p.get("wtenant"), "7");
    assert.equal(p.has("webx_filter"), false);
    calls = [];
    p = await listed({ filter: [{ field: "tenant.key", op: "eq", value: "nobody" }] });
    assert.equal(p.get("wtenant"), "-1");
  });

  it("sorts by the title or a date with WordPress's own orderby, and by any other field with webx_sort", async () => {
    let p = await listed({ sort: "title:DESC" });
    assert.deepEqual([p.get("orderby"), p.get("order"), p.has("webx_sort")], ["title", "desc", false]);
    calls = [];
    p = await listed({ sort: "updatedAt:asc" });
    assert.deepEqual([p.get("orderby"), p.get("order")], ["modified", "asc"]);
    calls = [];
    p = await listed({ sort: "order:desc" });
    assert.deepEqual([p.get("webx_sort"), p.has("orderby")], ["order:desc", false]);
    calls = [];
    p = await listed({ sort: "order" });
    assert.equal(p.get("webx_sort"), "order:asc", "a sort without a direction is ascending");
  });
});
