// Engine conformance suite (plan track C, milestone C1).
//
// One engine-neutral set of tests for the content part of the CmsAdapter
// contract (docs/engine-contract.md sections 2, 3, 4 and 8): create, update,
// draft and publish, locales, list/filter/sort/paginate, errors and tenant
// isolation. Every engine (Strapi, WordPress, the Rust engine) is run through
// the same cases by supplying a Harness; the in-memory engine in
// memory-adapter.ts runs it too, which tests the suite itself with no CMS.
//
// What the suite deliberately does not cover yet (each is a TODO, not a
// pass): media (upload, list, update, remove), users and roles (auth.*),
// block round-tripping, and the read API's query subset (the Rust engine's
// contract test already covers that against recorded Strapi traffic).
//
// Draft versus published cannot be observed through the CmsAdapter alone
// (get returns the editor's draft), so a harness also supplies
// readPublished(), which reads what the public read API (contract section 6)
// returns for the main tenant. That is the surface the build uses.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { CmsError } from "../../lib/cms/types";
import type { CmsAdapter } from "../../lib/cms/types";

/** One identity talking to an engine: an adapter plus whatever puts that
 * identity's credentials in scope while a call runs (Strapi and WordPress read
 * the session token from request context, see withServiceToken). */
export type Side = {
  adapter: CmsAdapter;
  as<T>(fn: () => Promise<T>): Promise<T>;
};

export type Harness = {
  name: string;
  /** A content type that is localized and has draft and publish. */
  uid: string;
  /** A required string field of that type. */
  textField: string;
  /** An integer field of that type, used for sorting. */
  numberField: string;
  /** The two locales to use, default first. */
  locales: [string, string];
  /** The tenant whose content the suite writes. */
  main: Side;
  /** A second tenant's editor; enables the isolation cases. */
  other?: Side;
  /** Rows of this type that the public read API returns for the main tenant
   * in this locale, whose text field starts with prefix. */
  readPublished(uid: string, locale: string, prefix: string): Promise<Record<string, any>[]>;
  setup?(): Promise<void>;
  teardown?(): Promise<void>;
};

const status = (e: unknown) => (e instanceof CmsError ? e.status : undefined);

/** Resolves to the CmsError a call throws; fails the test if it succeeds. */
async function rejection(p: Promise<unknown>, what: string): Promise<CmsError> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof CmsError, `${what}: expected a CmsError, got ${String(e)}`);
    return e;
  }
  assert.fail(`${what}: expected the call to fail, but it succeeded`);
}

export function conformanceSuite(h: Harness, opts: { skip?: string } = {}): void {
  const run = `conf${Date.now().toString(36)}`;
  const [L1, L2] = h.locales;
  const created: string[] = [];

  const m = h.main;
  const create = async (label: string, n = 0, locale?: string, extra: Record<string, any> = {}) => {
    const data = { [h.textField]: `${run}-${label}`, [h.numberField]: n, ...extra };
    const e: any = await m.as(() => m.adapter.entries.create(h.uid, data, locale ? { locale } : undefined));
    assert.ok(e?.documentId, "create must return the new entry with a documentId");
    created.push(e.documentId);
    return e;
  };
  const get = (id: string, locale?: string): Promise<any> => m.as(() => m.adapter.entries.get(h.uid, id, locale ? { locale } : undefined));
  const update = (id: string, data: Record<string, any>, locale?: string): Promise<any> =>
    m.as(() => m.adapter.entries.update(h.uid, id, data, locale ? { locale } : undefined));
  const publish = (id: string, locale?: string) => m.as(() => m.adapter.publish.publish(h.uid, id, locale ? { locale } : undefined));
  const unpublish = (id: string, locale?: string) => m.as(() => m.adapter.publish.unpublish(h.uid, id, locale ? { locale } : undefined));
  const published = (locale = L1) => h.readPublished(h.uid, locale, run);
  const textsOf = (rows: Record<string, any>[]) => rows.map((r) => r[h.textField]).sort();

  describe(`engine conformance: ${h.name}`, { skip: opts.skip }, () => {
    before(async () => { await h.setup?.(); });
    after(async () => {
      for (const id of created) await m.as(() => m.adapter.entries.remove(h.uid, id)).catch(() => {});
      await h.teardown?.();
    });

    it("schema: lists the content type as localized, with its REST plural name", async () => {
      const types = await m.as(() => m.adapter.schema.listContentTypes());
      const t = types.find((x) => x.uid === h.uid);
      assert.ok(t, `${h.uid} must be listed`);
      assert.equal(t.localized, true);
      assert.ok(t.pluralName, "pluralName is needed to build public read URLs");
      assert.ok(t.attributes[h.textField], `attributes must include ${h.textField}`);
    });

    it("create then get: the entry comes back with a documentId and the same fields", async () => {
      const e = await create("basic", 7);
      const got = await get(e.documentId);
      assert.equal(got.documentId, e.documentId);
      assert.equal(got[h.textField], `${run}-basic`);
      assert.equal(got[h.numberField], 7);
    });

    it("publish: a draft is invisible to the read API; publish shows it; unpublish hides it and keeps the draft", async () => {
      const e = await create("visibility");
      assert.ok(!textsOf(await published()).includes(`${run}-visibility`), "a draft must not be in the read API");
      await publish(e.documentId);
      assert.ok(textsOf(await published()).includes(`${run}-visibility`), "a published entry must be in the read API");
      await unpublish(e.documentId);
      assert.ok(!textsOf(await published()).includes(`${run}-visibility`), "an unpublished entry must leave the read API");
      assert.equal((await get(e.documentId))[h.textField], `${run}-visibility`, "unpublish keeps the draft");
    });

    it("update: editing changes the draft only; the read API keeps the published text until the next publish", async () => {
      const e = await create("v1");
      await publish(e.documentId);
      await update(e.documentId, { [h.textField]: `${run}-v2` });
      assert.equal((await get(e.documentId))[h.textField], `${run}-v2`, "get shows the draft");
      const before = textsOf(await published());
      assert.ok(before.includes(`${run}-v1`) && !before.includes(`${run}-v2`), "the published row is still the old text");
      await publish(e.documentId);
      const after = textsOf(await published());
      assert.ok(after.includes(`${run}-v2`) && !after.includes(`${run}-v1`), "publish copies the draft over the published row");
    });

    it("locales: a second locale is added under the same documentId and read back in its own language", async () => {
      const e = await create("locale", 1, L1);
      const added = await update(e.documentId, { [h.textField]: `${run}-locale-${L2}` }, L2);
      assert.equal(added.documentId, e.documentId, "adding a locale keeps the documentId");
      assert.equal((await get(e.documentId, L1))[h.textField], `${run}-locale`);
      assert.equal((await get(e.documentId, L2))[h.textField], `${run}-locale-${L2}`);
      await publish(e.documentId, L1);
      await publish(e.documentId, L2);
      assert.ok(textsOf(await published(L1)).includes(`${run}-locale`));
      assert.ok(textsOf(await published(L2)).includes(`${run}-locale-${L2}`));
      assert.ok(!textsOf(await published(L1)).includes(`${run}-locale-${L2}`), "a read is in one locale only");
    });

    it("locales: a locale that was never written reads as no entry (not an error, never a row)", async () => {
      // Contract section 3: a missing locale is an empty result, not an error.
      // Strapi answers 200 with no body data and its adapter hands that back as
      // an object without a documentId; other engines may return null. Callers
      // (VisualBuilder) test for the missing documentId.
      const e = await create("one-locale", 1, L1);
      const got = await get(e.documentId, L2);
      assert.ok(got == null || !got.documentId, `expected no entry for ${L2}, got ${JSON.stringify(got)}`);
      assert.ok(!textsOf(await published(L2)).includes(`${run}-one-locale`), "and the read API has no row for it either");
    });

    it("list: filters (eq, ne, contains), sorts and paginates, with total and pageCount", async () => {
      await create("list-a", 3);
      await create("list-b", 1);
      await create("list-c", 2);
      const scope = { field: h.textField, op: "contains" as const, value: `${run}-list-` };
      const q = (extra: object) => m.as(() => m.adapter.entries.list(h.uid, { filter: [scope], ...extra }));

      const all = await q({});
      assert.equal(all.total, 3);
      assert.equal(all.data.length, 3);

      const eq = await q({ filter: [{ field: h.textField, op: "eq", value: `${run}-list-b` }] });
      assert.deepEqual(textsOf(eq.data), [`${run}-list-b`]);

      const ne = await m.as(() => m.adapter.entries.list(h.uid, { filter: [scope, { field: h.textField, op: "ne", value: `${run}-list-b` }] }));
      assert.deepEqual(textsOf(ne.data), [`${run}-list-a`, `${run}-list-c`]);

      const asc = await q({ sort: `${h.numberField}:asc` });
      assert.deepEqual(asc.data.map((r: any) => r[h.numberField]), [1, 2, 3]);
      const desc = await q({ sort: `${h.numberField}:desc` });
      assert.deepEqual(desc.data.map((r: any) => r[h.numberField]), [3, 2, 1]);

      const p1 = await q({ sort: `${h.numberField}:asc`, page: 1, pageSize: 2 });
      const p2 = await q({ sort: `${h.numberField}:asc`, page: 2, pageSize: 2 });
      assert.equal(p1.total, 3);
      assert.equal(p1.pageCount, 2);
      assert.deepEqual(p1.data.map((r: any) => r[h.numberField]), [1, 2]);
      assert.deepEqual(p2.data.map((r: any) => r[h.numberField]), [3]);
    });

    it("remove: the entry is gone from get and from the read API", async () => {
      const e = await create("remove");
      await publish(e.documentId);
      await m.as(() => m.adapter.entries.remove(h.uid, e.documentId));
      const err = await rejection(get(e.documentId), "get after remove");
      assert.equal(err.status, 404);
      assert.ok(!textsOf(await published()).includes(`${run}-remove`));
    });

    it("errors: get, update and remove of an unknown documentId fail with CmsError 404", async () => {
      const missing = "doesnotexist0000000000000";
      assert.equal((await rejection(get(missing), "get")).status, 404);
      assert.equal((await rejection(update(missing, { [h.textField]: "x" }), "update")).status, 404);
      assert.equal((await rejection(m.as(() => m.adapter.entries.remove(h.uid, missing)), "remove")).status, 404);
    });

    it("validation: an entry missing a required field can never be published (400 at create or at publish)", async () => {
      // Strapi saves an incomplete draft and rejects it at publish; an engine
      // may instead refuse the create. Either is conforming; publishing an
      // incomplete entry is not.
      let id: string;
      try {
        const e: any = await m.as(() => m.adapter.entries.create(h.uid, { [h.numberField]: 1 }));
        id = e.documentId;
        created.push(id);
      } catch (e) {
        assert.equal(status(e), 400, "create without the required field must fail with 400 if it fails");
        return;
      }
      const err = await rejection(publish(id), "publish without the required field");
      assert.equal(err.status, 400);
    });

    if (h.other) {
      const o = h.other;
      describe("tenant isolation: another tenant's editor never reads or writes these rows", () => {
        it("list does not return them and get, update and remove are refused (403 or 404)", async () => {
          const e = await create("isolated");
          await publish(e.documentId);

          const theirs = await o.as(() => o.adapter.entries.list(h.uid, { filter: [{ field: h.textField, op: "contains", value: run }] }));
          assert.equal(theirs.data.length, 0, "the other tenant's list must be empty");

          const denied = (s: number | undefined) => assert.ok(s === 403 || s === 404, `expected 403 or 404, got ${s}`);
          denied(status(await rejection(o.as(() => o.adapter.entries.get(h.uid, e.documentId)), "get across tenants")));
          denied(status(await rejection(o.as(() => o.adapter.entries.update(h.uid, e.documentId, { [h.textField]: "hijacked" })), "update across tenants")));
          denied(status(await rejection(o.as(() => o.adapter.entries.remove(h.uid, e.documentId)), "remove across tenants")));

          assert.equal((await get(e.documentId))[h.textField], `${run}-isolated`, "the owner's entry is untouched");
        });
      });
    }
  });
}
