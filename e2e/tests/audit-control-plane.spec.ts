import { test, expect, type BrowserContext } from "@playwright/test";
import {
  WEBX_STUDIO, STRAPI_URL, studioContext,
  STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD,
  DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD,
  PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD,
} from "./_helpers";

// Track C3 (docs/target-architecture.md): with WEBX_CONTROL_URL and
// WEBX_CONTROL_SERVICE_TOKEN set on webx-studio, the audit log lives in
// webx-control, not Strapi. This signs in as real tenant editors, makes governed
// changes through webx-studio, and checks all of it end to end:
//   - the rows are in the control plane, attributed to the editor and tenant;
//   - the Audit Log screen's API (governed.list) shows an editor only their own
//     workspace's rows, read from the control plane;
//   - Strapi's own audit-log table got none of them.
// Needs the stack of cross-tenant-isolation.spec.ts plus a webx-control started
// with WEBX_CONTROL_SERVICE_TOKEN, and AUDIT_CONTROL_URL / AUDIT_CONTROL_TOKEN here.
const CONTROL = (process.env.AUDIT_CONTROL_URL || "").replace(/\/$/, "");
const TOKEN = process.env.AUDIT_CONTROL_TOKEN || "";
const SERVICE = "api::service.service";
const AUDIT = "api::audit-log.audit-log";

test.describe("Audit log in the control plane", () => {
  test.skip(
    !CONTROL || !TOKEN || !DGA_EDITOR_PASSWORD || !PEA_EDITOR_PASSWORD || !STRAPI_SCHEDULER_PASSWORD,
    "AUDIT_CONTROL_URL, AUDIT_CONTROL_TOKEN, DGA_EDITOR_PASSWORD, PEA_EDITOR_PASSWORD and STRAPI_SCHEDULER_PASSWORD required"
  );

  const loginAs = studioContext;
  const control = async (query: string) => {
    const r = await fetch(`${CONTROL}/internal/audit${query}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(r.ok, `control plane answered ${r.status}`).toBeTruthy();
    return (await r.json()) as { data: any[]; meta: { pagination: { total: number } } };
  };

  const key = "e2e_audit_" + Date.now();
  let dga: BrowserContext;
  let pea: BrowserContext;
  let serviceId = "";
  let originalTitle = "";
  let restored = false;
  const startedAt = new Date().toISOString();
  let strapiJwt: string;

  // How many rows Strapi's own table holds for one entry. Counted for the entry this spec changes, not the whole table: other
  // specs of the same run write to Strapi directly (a fixture change made as its admin is audited there, as it should be).
  const strapiAuditFor = async (entryId: string) => {
    const r = await fetch(`${STRAPI_URL}/content-manager/collection-types/${AUDIT}?page=1&pageSize=1&filters[entryId][$eq]=${encodeURIComponent(entryId)}`, { headers: { Authorization: `Bearer ${strapiJwt}` } });
    expect(r.ok, `Strapi content-manager answered ${r.status}`).toBeTruthy();
    const j = await r.json();
    return (j.pagination?.total ?? 0) as number;
  };

  test.beforeAll(async ({ browser }) => {
    const login = await fetch(`${STRAPI_URL}/admin/login`, {
      method: "POST", headers: { "content-type": "application/json", ...(process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {}) },
      body: JSON.stringify({ email: STRAPI_SCHEDULER_EMAIL, password: STRAPI_SCHEDULER_PASSWORD }),
    });
    strapiJwt = (await login.json())?.data?.token;
    expect(strapiJwt, "the scheduler account must be able to read Strapi's audit table").toBeTruthy();
    [dga, pea] = await Promise.all([
      loginAs(browser, DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD),
      loginAs(browser, PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD),
    ]);
  });

  test.afterAll(async () => {
    // put the title back even if an assertion failed in between
    if (serviceId && !restored) await dga?.request.put(`${WEBX_STUDIO}/api/cms/entries/${SERVICE}/${serviceId}`, { data: { title: originalTitle } }).catch(() => {});
    await dga?.close();
    await pea?.close();
  });

  test("governed changes by a dga editor are audited in the control plane, attributed to the editor and workspace", async () => {
    // updates, not creates: a create can hit the workspace's plan item limit, which has nothing to do with this
    const list = await dga.request.get(`${WEBX_STUDIO}/api/cms/entries/${SERVICE}?pageSize=1`);
    expect(list.ok(), "dga must be able to read its own services").toBeTruthy();
    const service = (await list.json()).data[0];
    expect(service, "dga has a seeded service to change").toBeTruthy();
    serviceId = service.documentId ?? service.id;
    originalTitle = service.title;
    const set = await dga.request.put(`${WEBX_STUDIO}/api/cms/entries/${SERVICE}/${serviceId}`, { data: { title: originalTitle + " (audit e2e " + key + ")" } });
    expect(set.ok(), "dga can edit its own service").toBeTruthy();
    const restore = await dga.request.put(`${WEBX_STUDIO}/api/cms/entries/${SERVICE}/${serviceId}`, { data: { title: originalTitle } });
    expect(restore.ok()).toBeTruthy();
    restored = true;

    const rows = (await control(`?filter=${encodeURIComponent(`entryId:eq:${serviceId}`)}&filter=${encodeURIComponent(`at:gte:${startedAt}`)}&sort=at:asc`)).data;
    expect(rows.map((r) => r.action), "one audit row per governed change, in order").toEqual(["update", "update"]);
    for (const r of rows) {
      expect(r.tenantKey, "attributed to the editor's workspace").toBe("dga");
      expect(r.adminEmail, "attributed to the editor").toBe(DGA_EDITOR_EMAIL);
      expect(r.contentType).toBe(SERVICE);
      expect(typeof r.createdAt).toBe("string");
    }
  });

  test("the Audit Log screen's API shows an editor their own workspace's rows from the control plane, and no one else's", async () => {
    const mine = await dga.request.get(`${WEBX_STUDIO}/api/cms/entries/${AUDIT}?pageSize=100&sort=at:desc`);
    expect(mine.ok(), "dga can read its audit log").toBeTruthy();
    const { data: dgaRows } = await mine.json();
    expect(dgaRows.length).toBeGreaterThan(0);
    expect(dgaRows.every((r: any) => r.tenantKey === "dga"), "only dga rows").toBeTruthy();
    expect(dgaRows.some((r: any) => r.contentType === SERVICE && r.entryId === serviceId), "the changes made above are in it").toBeTruthy();

    const theirs = await pea.request.get(`${WEBX_STUDIO}/api/cms/entries/${AUDIT}?pageSize=100`);
    expect(theirs.ok()).toBeTruthy();
    const { data: peaRows } = await theirs.json();
    expect(peaRows.some((r: any) => r.tenantKey === "dga"), "pea must not see a dga audit row").toBeFalsy();
  });

  test("the audit log is append-only through Studio, whatever the caller", async () => {
    const some = (await control("?pageSize=1&filter=" + encodeURIComponent("tenantKey:eq:dga"))).data[0];
    expect(some, "there is a dga row to try against").toBeTruthy();
    const edit = await dga.request.put(`${WEBX_STUDIO}/api/cms/entries/${AUDIT}/${some.documentId}`, { data: { action: "tampered" } });
    expect(edit.ok(), "editing an audit row must be refused").toBeFalsy();
    const del = await dga.request.delete(`${WEBX_STUDIO}/api/cms/entries/${AUDIT}/${some.documentId}`);
    expect(del.ok(), "deleting an audit row must be refused").toBeFalsy();
    const r = await fetch(`${CONTROL}/internal/audit/${some.documentId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect((await r.json()).data.action, "the row is unchanged").toBe(some.action);
  });

  test("Strapi's own audit table got none of it", async () => {
    expect(serviceId, "the first test changed a service").toBeTruthy();
    expect(await strapiAuditFor(serviceId), "no audit row for what the first test changed was written to Strapi while the control plane was on").toBe(0);
  });
});
