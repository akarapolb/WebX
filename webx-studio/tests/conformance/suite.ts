// Engine conformance suite (plan track C, milestone C1).
//
// One engine-neutral set of tests for the content part of the CmsAdapter
// contract (docs/engine-contract.md sections 2, 3, 4 and 8): create, update,
// draft and publish, locales, list/filter/sort/paginate, errors, tenant
// isolation, what a tenant key nobody has reads (decision D9) and the media
// library. Every engine (Strapi, WordPress, the Rust
// engine) is run through the same cases by supplying a Harness; the in-memory
// engine in memory-adapter.ts runs it too, which tests the suite itself with
// no CMS.
//
// What the suite deliberately does not cover: users and roles (auth.*), which
// move to webx-control in C4 (its step 8 adds the acting-token cases here),
// block round-tripping, and the read API's query subset (the Rust engine's
// contract test already covers that against recorded Strapi traffic).
//
// Draft versus published cannot be observed through the CmsAdapter alone
// (get returns the editor's draft), so a harness also supplies
// readPublished(), which reads what the public read API (contract section 6)
// returns for the main tenant. That is the surface the build uses.
//
// An engine that is known not to meet a case yet names it in `gaps`, with the
// reason. The case still runs, as a TODO: its failure does not fail the run,
// and a pass shows that the gap has closed. A gap is a statement about the
// engine, kept in its harness where a reviewer sees it, never a skipped test.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { CmsError } from "../../lib/cms/types";
import type { CmsAdapter, MediaAsset } from "../../lib/cms/types";

/** One identity talking to an engine: an adapter plus whatever puts that
 * identity's credentials in scope while a call runs (Strapi and WordPress read
 * the session token from request context, see withServiceToken). */
export type Side = {
  adapter: CmsAdapter;
  as<T>(fn: () => Promise<T>): Promise<T>;
};

/** Every case, by the id a harness uses to name a gap. */
export type CaseId =
  | "schema" | "create-get" | "publish" | "update-draft" | "locale-add" | "locale-missing" | "list" | "remove" | "errors"
  | "validation" | "unknown-tenant" | "isolation" | "media-upload" | "media-update" | "media-isolation" | "media-remove";

export type Harness = {
  name: string;
  /** A content type with draft and publish (localized, when the engine has locales). */
  uid: string;
  /** A required string field of that type. */
  textField: string;
  /** An integer field of that type, used for sorting. */
  numberField: string;
  /** The two locales to use, default first. Left out for an engine with no
   * per-locale rows (WordPress: contract section 3), whose locale cases are
   * then not applicable. */
  locales?: [string, string];
  /** The tenant whose content the suite writes. */
  main: Side;
  /** A second tenant's editor; enables the isolation cases. */
  other?: Side;
  /** Rows of this type that the public read API returns for the main tenant
   * (in this locale, for an engine with locales), whose text field starts
   * with prefix. */
  readPublished(uid: string, locale: string | undefined, prefix: string): Promise<Record<string, any>[]>;
  /** The same read for any tenant key, named the way a public site names its
   * tenant (contract section 2). With mainKey, it enables the unknown-tenant
   * case: the main tenant's key reads its entry, and a key no tenant has reads
   * nothing at all (decision D9). */
  readPublishedAs?(tenantKey: string, uid: string, locale: string | undefined, prefix: string): Promise<Record<string, any>[]>;
  /** The main tenant's key, as readPublishedAs takes it. */
  mainKey?: string;
  /** The media library (contract section 8), when the engine has one. */
  media?: {
    /** The tenant key given to upload and list. WordPress needs it; the other
     * engines take the tenant from the credential and ignore it. */
    tenantKey?: string;
    otherTenantKey?: string;
    /** Fetches an asset's url the way a visitor's browser would. */
    fetchFile(url: string): Promise<Response>;
  };
  /** Cases this engine does not meet yet, each with the reason. */
  gaps?: Partial<Record<CaseId, string>>;
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

/** A real 1x1 PNG (an engine may decode, resize or re-encode an upload, so
 * it has to be a genuine image, not just the signature). */
export const PNG_1X1 = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQKn4BAAIgAXZmNuK1AAAAAElFTkSuQmCC"), (c) => c.charCodeAt(0));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The id media.update and media.remove take: the documentId where the engine has one. */
const assetId = (a: MediaAsset) => a.documentId ?? String(a.id);

export function conformanceSuite(h: Harness, opts: { skip?: string } = {}): void {
  const run = `conf${Date.now().toString(36)}`;
  const [L1, L2] = h.locales ?? [undefined, undefined];
  const noLocales = h.locales ? undefined : "this engine has no per-locale rows (contract section 3)";
  const created: string[] = [];
  const uploaded: string[] = [];

  /** A case; one the harness names as a gap runs as a TODO with its reason. */
  const test = (id: CaseId, title: string, fn: () => Promise<void>, skip?: string) =>
    it(title, skip ? { skip } : h.gaps?.[id] ? { todo: `gap: ${h.gaps[id]}` } : {}, fn);

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
      for (const id of uploaded) await m.as(() => m.adapter.media.remove(id, h.media?.tenantKey)).catch(() => {});
      await h.teardown?.();
    });

    test("schema", `schema: lists the content type${h.locales ? " as localized" : " as not localized"}, with its REST plural name`, async () => {
      const types = await m.as(() => m.adapter.schema.listContentTypes());
      const t = types.find((x) => x.uid === h.uid);
      assert.ok(t, `${h.uid} must be listed`);
      assert.equal(t.localized, Boolean(h.locales));
      assert.ok(t.pluralName, "pluralName is needed to build public read URLs");
      assert.ok(t.attributes[h.textField], `attributes must include ${h.textField}`);
    });

    test("create-get", "create then get: the entry comes back with a documentId and the same fields", async () => {
      const e = await create("basic", 7);
      const got = await get(e.documentId);
      assert.equal(got.documentId, e.documentId);
      assert.equal(got[h.textField], `${run}-basic`);
      assert.equal(got[h.numberField], 7);
    });

    test("publish", "publish: a draft is invisible to the read API; publish shows it; unpublish hides it and keeps the draft", async () => {
      const e = await create("visibility");
      assert.ok(!textsOf(await published()).includes(`${run}-visibility`), "a draft must not be in the read API");
      await publish(e.documentId);
      assert.ok(textsOf(await published()).includes(`${run}-visibility`), "a published entry must be in the read API");
      await unpublish(e.documentId);
      assert.ok(!textsOf(await published()).includes(`${run}-visibility`), "an unpublished entry must leave the read API");
      assert.equal((await get(e.documentId))[h.textField], `${run}-visibility`, "unpublish keeps the draft");
    });

    test("update-draft", "update: editing changes the draft only; the read API keeps the published text until the next publish", async () => {
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

    test("locale-add", "locales: a second locale is added under the same documentId and read back in its own language", async () => {
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
    }, noLocales);

    test("locale-missing", "locales: a locale that was never written reads as no entry (not an error, never a row)", async () => {
      // Contract section 3: a missing locale is an empty result, not an error.
      // Strapi answers 200 with no body data and its adapter hands that back as
      // an object without a documentId; other engines may return null. Callers
      // (VisualBuilder) test for the missing documentId.
      const e = await create("one-locale", 1, L1);
      const got = await get(e.documentId, L2);
      assert.ok(got == null || !got.documentId, `expected no entry for ${L2}, got ${JSON.stringify(got)}`);
      assert.ok(!textsOf(await published(L2)).includes(`${run}-one-locale`), "and the read API has no row for it either");
    }, noLocales);

    test("list", "list: filters (eq, ne, contains), sorts and paginates, with total and pageCount", async () => {
      await create("list-a", 3);
      await create("list-b", 1);
      await create("list-c", 2);
      const scope = { field: h.textField, op: "contains" as const, value: `${run}-list-` };
      const q = (extra: object) => m.as(() => m.adapter.entries.list(h.uid, { filter: [scope], ...extra }));
      const numbers = (rows: any[]) => rows.map((r) => r[h.numberField]);

      const all = await q({});
      assert.equal(all.total, 3);
      assert.equal(all.data.length, 3);

      const eq = await q({ filter: [{ field: h.textField, op: "eq", value: `${run}-list-b` }] });
      assert.deepEqual(textsOf(eq.data), [`${run}-list-b`]);

      const ne = await m.as(() => m.adapter.entries.list(h.uid, { filter: [scope, { field: h.textField, op: "ne", value: `${run}-list-b` }] }));
      assert.deepEqual(textsOf(ne.data), [`${run}-list-a`, `${run}-list-c`]);

      const asc = await q({ sort: `${h.numberField}:asc` });
      assert.deepEqual(numbers(asc.data), [1, 2, 3]);
      const desc = await q({ sort: `${h.numberField}:desc` });
      assert.deepEqual(numbers(desc.data), [3, 2, 1]);

      const p1 = await q({ sort: `${h.numberField}:asc`, page: 1, pageSize: 2 });
      const p2 = await q({ sort: `${h.numberField}:asc`, page: 2, pageSize: 2 });
      assert.equal(p1.total, 3);
      assert.equal(p1.pageCount, 2);
      assert.deepEqual(numbers(p1.data), [1, 2]);
      assert.deepEqual(numbers(p2.data), [3]);
    });

    test("remove", "remove: the entry is gone from get and from the read API", async () => {
      const e = await create("remove");
      await publish(e.documentId);
      await m.as(() => m.adapter.entries.remove(h.uid, e.documentId));
      const err = await rejection(get(e.documentId), "get after remove");
      assert.equal(err.status, 404);
      assert.ok(!textsOf(await published()).includes(`${run}-remove`));
    });

    test("errors", "errors: get, update and remove of an unknown documentId fail with CmsError 404", async () => {
      const missing = "doesnotexist0000000000000";
      assert.equal((await rejection(get(missing), "get")).status, 404);
      assert.equal((await rejection(update(missing, { [h.textField]: "x" }), "update")).status, 404);
      assert.equal((await rejection(m.as(() => m.adapter.entries.remove(h.uid, missing)), "remove")).status, 404);
    });

    test("validation", "validation: an entry missing a required field can never be published (400 at create or at publish)", async () => {
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

    test("unknown-tenant", "unknown tenant: a read that names a tenant key nobody has returns nothing, never another tenant's rows (D9)", async () => {
      const read = h.readPublishedAs!;
      const e = await create("d9");
      await publish(e.documentId);
      assert.ok(textsOf(await read(h.mainKey!, h.uid, L1, run)).includes(`${run}-d9`), "the main tenant's own key reads the published entry");
      // Read with no prefix: a key that fell back to any tenant, the main one or the default, would show that tenant's rows.
      for (const key of [`${run}-nobody`, `${h.mainKey}x`]) {
        assert.deepEqual(await read(key, h.uid, L1, ""), [], `"${key}" is no tenant's key, so it reads nothing at all`);
      }
    }, h.readPublishedAs && h.mainKey ? undefined : "this harness cannot name the tenant in a public read");

    const denied = (s: number | undefined, what: string) => assert.ok(s === 403 || s === 404, `${what}: expected 403 or 404, got ${s}`);

    if (h.other) {
      const o = h.other;
      describe("tenant isolation: another tenant's editor never reads or writes these rows", () => {
        test("isolation", "list does not return them and get, update and remove are refused (403 or 404)", async () => {
          const e = await create("isolated");
          await publish(e.documentId);

          const theirs = await o.as(() => o.adapter.entries.list(h.uid, { filter: [{ field: h.textField, op: "contains", value: run }] }));
          assert.equal(theirs.data.length, 0, "the other tenant's list must be empty");

          denied(status(await rejection(o.as(() => o.adapter.entries.get(h.uid, e.documentId)), "get across tenants")), "get");
          denied(status(await rejection(o.as(() => o.adapter.entries.update(h.uid, e.documentId, { [h.textField]: "hijacked" })), "update across tenants")), "update");
          denied(status(await rejection(o.as(() => o.adapter.entries.remove(h.uid, e.documentId)), "remove across tenants")), "remove");

          assert.equal((await get(e.documentId))[h.textField], `${run}-isolated`, "the owner's entry is untouched");
        });
      });
    }

    const md = h.media;
    if (md) {
      describe("media library", () => {
        const name = `${run}.png`;
        let asset: MediaAsset | undefined;
        const mine = () => {
          assert.ok(asset, "the upload case did not leave an asset");
          return asset;
        };
        const list = (side: Side, tenantKey?: string) => side.as(() => side.adapter.media.list({ search: run, tenantKey }));

        test("media-upload", "upload: the asset has an id, its url, type and name, the library lists it, and the engine serves the file", async () => {
          const a = await m.as(() => m.adapter.media.upload(new File([PNG_1X1], name, { type: "image/png" }), md.tenantKey));
          assert.ok(a.documentId || a.id != null, "an uploaded asset has an id");
          uploaded.push(assetId(a));
          asset = a;
          assert.ok(a.url, "an uploaded asset has a url");
          assert.equal(a.mime, "image/png");
          assert.ok(String(a.name ?? "").includes(run), `the asset is named after the file, got ${a.name}`);
          if (a.width != null || a.height != null) assert.deepEqual([a.width, a.height], [1, 1], "an image's size is its own");
          const served = await md.fetchFile(a.url);
          assert.equal(served.status, 200, `the engine serves ${a.url}`);
          assert.deepEqual([...new Uint8Array(await served.arrayBuffer()).slice(0, 8)], PNG_SIGNATURE, "the file served is the PNG");
          const listed = await list(m, md.tenantKey);
          assert.equal(listed.total, 1, "the library lists it once");
          assert.equal(assetId(listed.data[0]), assetId(a));
        });

        test("media-update", "update: caption, alt text and tags are set; a field left out stays as it was; null clears one", async () => {
          const id = assetId(mine());
          const upd = (patch: Parameters<CmsAdapter["media"]["update"]>[1]) => m.as(() => m.adapter.media.update(id, patch, md.tenantKey));
          let a = await upd({ caption: `${run} caption`, tags: "conformance" });
          assert.equal(a.caption, `${run} caption`);
          assert.equal(a.tags, "conformance");
          a = await upd({ alt: "a one-pixel test image" });
          assert.equal(a.alt, "a one-pixel test image");
          assert.equal(a.caption, `${run} caption`, "a field left out is untouched");
          a = await upd({ caption: null });
          assert.ok(!a.caption, `null clears the caption, got ${JSON.stringify(a.caption)}`);
          assert.equal(a.alt, "a one-pixel test image", "and leaves the others");
          assert.equal(a.tags, "conformance");
        });

        if (h.other) {
          const o = h.other;
          test("media-isolation", "another tenant's library does not list it, and its editor can neither change nor remove it (403 or 404)", async () => {
            const id = assetId(mine());
            assert.equal((await list(o, md.otherTenantKey)).total, 0, "the other tenant's library must not show it");
            denied(status(await rejection(o.as(() => o.adapter.media.update(id, { caption: "hijacked" }, md.otherTenantKey)), "update across tenants")), "update");
            denied(status(await rejection(o.as(() => o.adapter.media.remove(id, md.otherTenantKey)), "remove across tenants")), "remove");
            assert.equal((await list(m, md.tenantKey)).total, 1, "the owner still has it");
          });
        }

        test("media-remove", "remove: the asset leaves the library, the engine stops serving the file, and removing it again is a 404", async () => {
          const a = mine();
          await m.as(() => m.adapter.media.remove(assetId(a), md.tenantKey));
          assert.equal((await list(m, md.tenantKey)).total, 0, "the library no longer lists it");
          assert.equal((await md.fetchFile(a.url)).status, 404, "the file is no longer served");
          assert.equal((await rejection(m.as(() => m.adapter.media.remove(assetId(a), md.tenantKey)), "remove again")).status, 404);
        });
      });
    }
  });
}
