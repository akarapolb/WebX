// The form inboxes' two sources (lib/cms/form-merge.ts, track C5): what Studio asks the control plane for, how its rows are shown, and
// what an editor may change on a submission it holds.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { controlFormQuery, decorateFormRow, editableFormFields, FORM_FILTER_FIELDS, FORM_UID_OF_COLLECTION, FORM_UIDS, formInbox, formUidOf, WP_FORM_UID_OF_COLLECTION } from "../lib/cms/form-merge";
import { CONTROL_READ_COLLECTIONS, CONTROL_RECORD_COLLECTIONS, fetchControlFile } from "../lib/cms/records-store";

describe("the form uids", () => {
  it("are the four inboxes, and a WordPress tenant's three (D6), each read from the control plane's collection of that name and none switched like the moved types", () => {
    assert.deepEqual([...FORM_UIDS].sort(), [
      "api::application.application", "api::complaint.complaint", "api::contact-message.contact-message", "api::registration.registration",
      "wp:application", "wp:complaint", "wp:contact-message",
    ]);
    for (const map of [FORM_UID_OF_COLLECTION, WP_FORM_UID_OF_COLLECTION]) {
      for (const [collection, uid] of Object.entries(map)) {
        assert.equal(CONTROL_READ_COLLECTIONS[uid], collection);
        assert.equal(CONTROL_RECORD_COLLECTIONS[uid], undefined, "the engine's own rows and writes stay where they are");
      }
    }
  });
  it("name a control-plane collection the way the workspace's engine does, for its custom roles", () => {
    assert.equal(formUidOf("complaint", "wordpress"), "wp:complaint");
    assert.equal(formUidOf("contact-message", "wordpress"), "wp:contact-message");
    assert.equal(formUidOf("complaint", "strapi"), "api::complaint.complaint");
    assert.equal(formUidOf("complaint", undefined), "api::complaint.complaint", "no engine: Strapi, the default");
    assert.equal(formUidOf("registration", "wordpress"), undefined, "WordPress has no registrations");
    assert.equal(formUidOf("consent-log", "strapi"), undefined, "not a form");
  });
});

describe("controlFormQuery", () => {
  it("scopes by workspace key, keeps the filters the control plane can apply, and drops the ones on encrypted personal data", () => {
    const q = controlFormQuery({ sort: "createdAt:DESC", page: 1, pageSize: 25, filter: [
      { field: "name", op: "eq", value: "สมชาย" }, { field: "email", op: "contains", value: "@" }, { field: "phone", op: "eq", value: "08" },
      { field: "firstname", op: "eq", value: "x" }, { field: "lastname", op: "eq", value: "y" },
      { field: "tenant.key", op: "eq", value: "dga" }, { field: "tenantKey", op: "eq", value: "dga" },
      { field: "stage", op: "eq", value: 0 }, { field: "createdAt", op: "gte", value: "2026-11-01T00:00:00.000Z" },
    ] }, "pea");
    assert.deepEqual(q.filter, [{ field: "stage", op: "eq", value: 0 }, { field: "createdAt", op: "gte", value: "2026-11-01T00:00:00.000Z" }, { field: "tenantKey", op: "eq", value: "pea" }]);
    assert.equal(q.sort, "createdAt:DESC");
    for (const pii of ["name", "email", "phone", "firstname", "lastname"]) assert.equal(FORM_FILTER_FIELDS.has(pii), false, pii);
  });
  it("adds no workspace for an unscoped caller", () => {
    assert.deepEqual(controlFormQuery({ filter: [{ field: "ref", op: "eq", value: "DGA-CMP-2569-111111" }] }, null).filter, [{ field: "ref", op: "eq", value: "DGA-CMP-2569-111111" }]);
    assert.deepEqual(controlFormQuery(undefined, null).filter, []);
  });
});

describe("formInbox", () => {
  // the control plane's side, as createControlRecordsAdapter would answer; only list is used
  const controlWith = (rows: any[], seen: any[]) => ({
    entries: { list: async (uid: string, q: any) => { seen.push({ uid, q }); return { data: rows, total: rows.length, pageCount: 1 }; } },
  }) as any;

  it("lists a WordPress tenant's own submissions and the control plane's as one, newest first, the control side scoped to the workspace (D6)", async () => {
    const seen: any[] = [];
    const ownQueries: any[] = [];
    const wordpress = async (q: any) => {
      ownQueries.push(q);
      return { data: [{ id: 11, ref: "ORST-CMP-2569-111111", subject: "เก่า", createdAt: "2026-11-20T00:00:00" }], total: 1, pageCount: 1 };
    };
    const control = controlWith([{ documentId: "c1", ref: "ORST-CMP-2569-222222", subject: "ใหม่", tenantKey: "orst", createdAt: "2026-11-28T00:00:00.000Z", attachment: { documentId: "f1", name: "a.pdf" } }], seen);
    const list = await formInbox("wp:complaint", { pageSize: 10, filter: [{ field: "email", op: "contains", value: "@" }, { field: "stage", op: "eq", value: 0 }] }, "orst", wordpress, control);
    assert.deepEqual(list.data.map((r) => r.subject), ["ใหม่", "เก่า"]);
    assert.equal(list.total, 2);
    assert.equal(seen[0].uid, "wp:complaint");
    assert.deepEqual(seen[0].q.filter, [{ field: "stage", op: "eq", value: 0 }, { field: "tenantKey", op: "eq", value: "orst" }], "scoped to the workspace; no filter on encrypted personal data");
    assert.equal(list.data[0].attachment.url, "/api/cms/forms-file/f1", "the control plane's file is served by Studio");
    assert.equal(ownQueries[0].sort, "createdAt:DESC", "the engine's side is asked in the same order");
  });

  it("asks the control plane for a workspace that cannot exist when the caller's did not resolve, so it lists none of its rows", async () => {
    const seen: any[] = [];
    await formInbox("wp:contact-message", undefined, "__unscoped__", async () => ({ data: [], total: 0, pageCount: 0 }), controlWith([], seen));
    assert.deepEqual(seen[0].q.filter, [{ field: "tenantKey", op: "eq", value: "__unscoped__" }]);
  });
});

describe("decorateFormRow", () => {
  it("gives a held file the url Studio serves it at, and leaves the rest of the row alone", () => {
    const row = { documentId: "d1", ref: "R", attachment: { documentId: "f1", name: "หลักฐาน.pdf", mime: "application/pdf", size: 5 }, name: "N" };
    const d = decorateFormRow(row);
    assert.deepEqual(d.attachment, { documentId: "f1", name: "หลักฐาน.pdf", mime: "application/pdf", size: 5, url: "/api/cms/forms-file/f1" });
    assert.equal(d.name, "N");
    assert.equal((row.attachment as any).url, undefined, "the original is not changed");
    assert.deepEqual(decorateFormRow({ resume: { documentId: "a b/c" } }).resume, { documentId: "a b/c", url: "/api/cms/forms-file/a%20b%2Fc" });
    assert.deepEqual(decorateFormRow({ ref: "R" }), { ref: "R" });
    assert.deepEqual(decorateFormRow({ attachment: null }), { attachment: null });
  });
});

describe("editableFormFields", () => {
  it("keeps what an editor may change and drops what the server owns", () => {
    const out = editableFormFields({ stage: 2, steps: [{ note: "n" }], handled: true, name: "ชื่อใหม่", tenantKey: "dga", tenant: 3, ref: "FORGED", attachment: { documentId: "x" }, resume: {}, documentId: "d", id: 9, createdAt: "x", updatedAt: "y", publishedAt: "z" });
    assert.deepEqual(out, { stage: 2, steps: [{ note: "n" }], handled: true, name: "ชื่อใหม่" });
  });
});

describe("fetchControlFile", () => {
  it("asks the control plane for the file with the service token", async () => {
    const real = globalThis.fetch;
    const seen: { url: string; auth: string }[] = [];
    globalThis.fetch = (async (url: any, init: any) => { seen.push({ url: String(url), auth: init.headers.Authorization }); return new Response("bytes"); }) as typeof fetch;
    try {
      const r = await fetchControlFile({ baseUrl: "http://c:1400", token: "tok" }, "f 1");
      assert.equal(await r.text(), "bytes");
      assert.deepEqual(seen, [{ url: "http://c:1400/internal/files/f%201", auth: "Bearer tok" }]);
    } finally {
      globalThis.fetch = real;
    }
  });
});
