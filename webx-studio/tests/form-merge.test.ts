// The form inboxes' two sources (lib/cms/form-merge.ts, track C5): what Studio asks the control plane for, how its rows are shown, and
// what an editor may change on a submission it holds.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { controlFormQuery, decorateFormRow, editableFormFields, FORM_FILTER_FIELDS, FORM_UID_OF_COLLECTION, FORM_UIDS } from "../lib/cms/form-merge";
import { CONTROL_READ_COLLECTIONS, CONTROL_RECORD_COLLECTIONS, fetchControlFile } from "../lib/cms/records-store";

describe("the form uids", () => {
  it("are the four inboxes, each read from the control plane's collection of that name and none switched like the moved types", () => {
    assert.deepEqual([...FORM_UIDS].sort(), ["api::application.application", "api::complaint.complaint", "api::contact-message.contact-message", "api::registration.registration"]);
    for (const [collection, uid] of Object.entries(FORM_UID_OF_COLLECTION)) {
      assert.equal(CONTROL_READ_COLLECTIONS[uid], collection);
      assert.equal(CONTROL_RECORD_COLLECTIONS[uid], undefined, "the engine's own rows and writes stay where they are");
    }
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
