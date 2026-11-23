// Runs the conformance suite against the Rust engine's write API through
// createRustAdapter. Skipped unless CONFORMANCE_RUST_URL and
// CONFORMANCE_RUST_TOKEN are set, so `npm test` stays offline:
//
//   node rust-engine/tools/export-snapshot.mjs        (a Strapi with content)
//   webx-read-engine import --snapshot ... --db engine.db
//   webx-read-engine token --db engine.db --tenant dga      -> CONFORMANCE_RUST_TOKEN
//   webx-read-engine token --db engine.db --tenant pea      -> CONFORMANCE_RUST_OTHER_TOKEN (optional)
//   webx-read-engine --db engine.db --port 1338             -> CONFORMANCE_RUST_URL=http://localhost:1338
//
// CONFORMANCE_RUST_TENANT is the main token's tenant (default dga). It writes
// FAQ entries prefixed "conf<time>" and removes them afterwards.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conformanceSuite } from "./suite";
import { CmsError } from "../../lib/cms/types";
import type { Side } from "./suite";
import { createRustAdapter } from "../../lib/cms/rust";

const url = process.env.CONFORMANCE_RUST_URL || "";
const token = process.env.CONFORMANCE_RUST_TOKEN || "";
const otherToken = process.env.CONFORMANCE_RUST_OTHER_TOKEN || "";
const tenant = process.env.CONFORMANCE_RUST_TENANT || "dga";
const configured = Boolean(url && token);

// the engine takes the token on every call, so there is no ambient session to switch
const side = (t: string): Side => ({ adapter: createRustAdapter({ baseUrl: url, token: () => t }), as: (fn) => fn() });

conformanceSuite(
  {
    name: `Rust engine at ${url || "(not configured)"}`,
    uid: "api::faq.faq",
    textField: "question",
    numberField: "order",
    locales: ["th", "en"],
    main: side(token),
    other: otherToken ? side(otherToken) : undefined,
    async readPublished(_uid, locale, prefix) {
      // the public read API, as the build calls it (contract section 6)
      const q = `tenant=${tenant}&locale=${locale}&pagination[pageSize]=100&filters[question][$startsWith]=${encodeURIComponent(prefix)}`;
      const r = await fetch(`${url}/api/faqs?${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`read API returned ${r.status}`);
      return (await r.json()).data ?? [];
    },
  },
  { skip: configured ? undefined : "set CONFORMANCE_RUST_URL and CONFORMANCE_RUST_TOKEN to run against the Rust engine" },
);

// The media library (R4). The shared suite has no media cases yet (its TODO),
// so the Rust adapter's own are here.
describe("Rust engine media library", { skip: configured ? undefined : "set CONFORMANCE_RUST_URL and CONFORMANCE_RUST_TOKEN" }, () => {
  const main = createRustAdapter({ baseUrl: url, token: () => token });
  const other = otherToken ? createRustAdapter({ baseUrl: url, token: () => otherToken }) : undefined;
  const name = `conf${Date.now().toString(36)}.png`;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let id = "";

  it("upload returns an asset the library lists and the engine serves", async () => {
    const a = await main.media.upload(new File([png], name, { type: "image/png" }), tenant);
    assert.ok(a.documentId && a.url.startsWith("/uploads/"), "asset has a documentId and a /uploads url");
    assert.equal(a.mime, "image/png");
    assert.equal(a.name, name);
    id = a.documentId!;
    const served = await fetch(url + a.url);
    assert.equal(served.status, 200);
    assert.deepEqual(new Uint8Array(await served.arrayBuffer()), png);
    const list = await main.media.list({ search: name });
    assert.equal(list.total, 1);
  });

  it("update sets caption and tags, an omitted field stays, null clears", async () => {
    let a = await main.media.update(id, { caption: "cap", tags: "t1" });
    assert.equal(a.caption, "cap");
    a = await main.media.update(id, { alt: "alt text" });
    assert.equal(a.caption, "cap", "an omitted field is untouched");
    a = await main.media.update(id, { caption: null });
    assert.equal(a.caption, undefined);
    assert.equal(a.alt, "alt text");
  });

  it("another tenant's library does not show it and cannot change it", { skip: other ? undefined : "no second token" }, async () => {
    assert.equal((await other!.media.list({ search: name })).total, 0);
    await assert.rejects(other!.media.update(id, { caption: "x" }), (e) => e instanceof CmsError && e.status === 404);
    await assert.rejects(other!.media.remove(id), (e) => e instanceof CmsError && e.status === 404);
  });

  it("remove deletes it and its file", async () => {
    const a = (await main.media.list({ search: name })).data[0];
    await main.media.remove(id);
    assert.equal((await main.media.list({ search: name })).total, 0);
    assert.equal((await fetch(url + a.url)).status, 404);
    await assert.rejects(main.media.remove(id), (e) => e instanceof CmsError && e.status === 404);
  });
});
