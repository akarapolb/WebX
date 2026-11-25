import { test, expect, type BrowserContext } from "@playwright/test";
import {
  WEBX_STUDIO, STRAPI_URL, studioContext,
  STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD,
  DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD,
  PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD,
} from "./_helpers";

// Track C3 (docs/target-architecture.md): with WEBX_CONTROL_URL and
// WEBX_CONTROL_SERVICE_TOKEN set on webx-studio, page templates (and page
// versions) live in webx-control, not Strapi. This signs in as real tenant
// editors and checks, end to end:
//   - a template an editor saves is stored in the control plane for their workspace;
//   - the workspace scoping around it is unchanged: a template is seen by its own
//     workspace and by none other, a shared one (no workspace) by everyone, and one
//     workspace cannot change another's;
//   - Strapi's own page-template table got none of it.
// Same stack as audit-control-plane.spec.ts: AUDIT_CONTROL_URL / AUDIT_CONTROL_TOKEN.
const CONTROL = (process.env.AUDIT_CONTROL_URL || "").replace(/\/$/, "");
const TOKEN = process.env.AUDIT_CONTROL_TOKEN || "";
const TEMPLATE = "api::page-template.page-template";

test.describe("Page templates in the control plane", () => {
  test.skip(
    !CONTROL || !TOKEN || !DGA_EDITOR_PASSWORD || !PEA_EDITOR_PASSWORD || !STRAPI_SCHEDULER_PASSWORD,
    "AUDIT_CONTROL_URL, AUDIT_CONTROL_TOKEN, DGA_EDITOR_PASSWORD, PEA_EDITOR_PASSWORD and STRAPI_SCHEDULER_PASSWORD required"
  );

  const loginAs = studioContext;
  const control = (path: string, init: RequestInit = {}) =>
    fetch(`${CONTROL}/internal/records/page-template${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers || {}) } });

  const key = "e2e_tpl_" + Date.now();
  let dga: BrowserContext;
  let pea: BrowserContext;
  let strapiJwt: string;
  let mineId = "";
  let sharedId = "";
  let strapiTotalBefore: number;

  const strapiTotal = async () => {
    const r = await fetch(`${STRAPI_URL}/content-manager/collection-types/${TEMPLATE}?page=1&pageSize=1`, { headers: { Authorization: `Bearer ${strapiJwt}` } });
    expect(r.ok, `Strapi content-manager answered ${r.status}`).toBeTruthy();
    return ((await r.json()).pagination?.total ?? 0) as number;
  };
  const names = async (ctx: BrowserContext) => {
    const r = await ctx.request.get(`${WEBX_STUDIO}/api/cms/entries/${TEMPLATE}?pageSize=100`);
    expect(r.ok(), "can read templates").toBeTruthy();
    return ((await r.json()).data as any[]).map((t) => t.name as string);
  };

  test.beforeAll(async ({ browser }) => {
    const login = await fetch(`${STRAPI_URL}/admin/login`, {
      method: "POST", headers: { "content-type": "application/json", ...(process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {}) },
      body: JSON.stringify({ email: STRAPI_SCHEDULER_EMAIL, password: STRAPI_SCHEDULER_PASSWORD }),
    });
    strapiJwt = (await login.json())?.data?.token;
    expect(strapiJwt, "the scheduler account must be able to read Strapi's template table").toBeTruthy();
    [dga, pea] = await Promise.all([
      loginAs(browser, DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD),
      loginAs(browser, PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD),
    ]);
    strapiTotalBefore = await strapiTotal();
  });

  test.afterAll(async () => {
    for (const id of [mineId, sharedId]) if (id) await control("/" + id, { method: "DELETE" }).catch(() => {});
    await dga?.close();
    await pea?.close();
  });

  test("a template a dga editor saves is stored in the control plane for dga", async () => {
    const r = await dga.request.post(`${WEBX_STUDIO}/api/cms/entries/${TEMPLATE}`, { data: { key, name: "Mine " + key, dialect: "gov-portal", blocks: [] } });
    expect(r.ok(), `create answered ${r.status()}`).toBeTruthy();
    const body = await r.json();
    const made = body.data ?? body; // Studio answers a create with the entry itself
    mineId = made.documentId;
    const stored = (await (await control("/" + mineId)).json()).data;
    expect(stored.tenantKey, "stamped with the editor's workspace").toBe("dga");
    expect(stored.key).toBe(key);
  });

  test("workspace scoping is unchanged: own and shared templates are seen, another workspace's are not", async () => {
    const shared = await control("", { method: "POST", body: JSON.stringify({ data: { key: key + "_shared", name: "Shared " + key, dialect: "gov-portal", tenantKey: "", blocks: [] } }) });
    sharedId = (await shared.json()).data.documentId;
    const dgaSees = await names(dga);
    expect(dgaSees, "dga sees its own").toContain("Mine " + key);
    expect(dgaSees, "dga sees a shared one").toContain("Shared " + key);
    const peaSees = await names(pea);
    expect(peaSees, "pea does not see dga's").not.toContain("Mine " + key);
    expect(peaSees, "pea sees the shared one").toContain("Shared " + key);
  });

  test("one workspace cannot change another's template, nor a shared one", async () => {
    const byPea = await pea.request.put(`${WEBX_STUDIO}/api/cms/entries/${TEMPLATE}/${mineId}`, { data: { name: "hijacked" } });
    expect(byPea.ok(), "pea must not edit dga's template").toBeFalsy();
    const shared = await dga.request.put(`${WEBX_STUDIO}/api/cms/entries/${TEMPLATE}/${sharedId}`, { data: { name: "hijacked" } });
    expect(shared.ok(), "a workspace editor must not edit a shared template").toBeFalsy();
    const mine = (await (await control("/" + mineId)).json()).data;
    const theirs = (await (await control("/" + sharedId)).json()).data;
    expect([mine.name, theirs.name]).toEqual(["Mine " + key, "Shared " + key]);
    const own = await dga.request.put(`${WEBX_STUDIO}/api/cms/entries/${TEMPLATE}/${mineId}`, { data: { name: "Renamed " + key } });
    expect(own.ok(), "dga can edit its own").toBeTruthy();
    expect(((await (await control("/" + mineId)).json()).data).name).toBe("Renamed " + key);
  });

  test("Strapi's own page-template table got none of it", async () => {
    expect(await strapiTotal()).toBe(strapiTotalBefore);
  });
});
