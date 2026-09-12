import { test, expect, type BrowserContext } from "@playwright/test";
import {
  WEBX_STUDIO,
  DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD,
  PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD,
} from "./_helpers";

// A full-codebase audit (2026-09-12) found no automated test anywhere in
// this repo — unit or e2e — exercising the single most security-critical
// guarantee the whole system makes: tenant A cannot read or write tenant
// B's data. That gap is exactly why three real cross-tenant bugs shipped
// undetected in the same audit:
//   - block-type/icon missing from strapi-cms/src/index.ts's SCOPED set
//     (and from governance.ts's own separate SCOPED set) — any editor could
//     read/write another tenant's custom Visual-Builder block definitions
//     and icon library.
//   - /api/ai/search + /api/ai/index trusting a client-supplied `tenant`
//     body field outright.
//   - /api/console/export (strapi-cms) resolving tenant from a public
//     query param instead of the admin's own membership.
// All three are fixed as of this test being added. This suite logs in as
// two REAL tenant-scoped editors (dga, pea — the two demo tenants this repo
// ships with) through the real UI and confirms neither can reach the
// other's data through webx-studio's governed API, using content types that
// span both the "always been scoped" case (service) and the "just fixed"
// case (block-type) so a regression in either shows up here.
test.describe("Cross-tenant isolation", () => {
  test.skip(
    !DGA_EDITOR_PASSWORD || !PEA_EDITOR_PASSWORD,
    "DGA_EDITOR_PASSWORD and PEA_EDITOR_PASSWORD required — see e2e/README.md"
  );

  async function loginAs(browser: import("@playwright/test").Browser, email: string, password: string): Promise<BrowserContext> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(WEBX_STUDIO + "/login");
    await page.getByRole("tab", { name: "Strapi" }).click();
    await page.getByPlaceholder("admin@webx.io").fill(email);
    await page.getByPlaceholder("••••••••").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await page.close();
    return context;
  }

  let dga: BrowserContext;
  let pea: BrowserContext;
  let peaServiceId: string;
  // A block-type created fresh by pea for this test run, rather than relying
  // on any pre-existing seeded row — block-type isn't seeded data (editors
  // create these ad hoc via the Visual Builder), so a real one has to be
  // made here to have something to target.
  let peaBlockTypeId: string;
  const peaBlockTypeKey = "e2e_isolation_check_" + Date.now();

  test.beforeAll(async ({ browser }) => {
    [dga, pea] = await Promise.all([
      loginAs(browser, DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD),
      loginAs(browser, PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD),
    ]);

    // A real pea-owned service, fetched AS pea (legitimate access) — the
    // target of every cross-tenant attempt below.
    const list = await pea.request.get(WEBX_STUDIO + "/api/cms/entries/api::service.service?pageSize=1");
    expect(list.ok(), "pea must be able to read its own services").toBeTruthy();
    const { data } = await list.json();
    expect(data.length, "pea tenant has no seeded services to test against").toBeGreaterThan(0);
    peaServiceId = data[0].documentId ?? data[0].id;

    // A real pea-owned block-type, created here as pea for the same reason.
    const created = await pea.request.post(WEBX_STUDIO + "/api/cms/entries/api::block-type.block-type", {
      data: { key: peaBlockTypeKey, name: "E2E isolation check", template: "<div>{{heading}}</div>", fieldsSchema: [{ key: "heading", label: "Heading", type: "text" }] },
    });
    expect(created.ok(), "pea must be able to create its own block-type").toBeTruthy();
    const createdBody = await created.json();
    peaBlockTypeId = createdBody.documentId ?? createdBody.id;
  });

  test.afterAll(async () => {
    // Best-effort cleanup — don't fail the suite over it.
    await pea?.request.delete(WEBX_STUDIO + "/api/cms/entries/api::block-type.block-type/" + peaBlockTypeId).catch(() => {});
    await dga?.close();
    await pea?.close();
  });

  test("dga cannot read pea's service by id", async () => {
    const res = await dga.request.get(WEBX_STUDIO + "/api/cms/entries/api::service.service/" + peaServiceId);
    // Scoped away entirely — either 404 (filtered out of dga's own scope) or
    // 403 (explicit cross-tenant rejection); never 200 with pea's data.
    expect(res.status(), "cross-tenant read must not succeed").not.toBe(200);
  });

  test("dga cannot update pea's service", async () => {
    const res = await dga.request.put(WEBX_STUDIO + "/api/cms/entries/api::service.service/" + peaServiceId, {
      data: { title: "hijacked by cross-tenant-isolation.spec.ts" },
    });
    expect(res.status(), "cross-tenant update must not succeed").not.toBe(200);

    // Confirm as pea (the real owner) that the row is genuinely untouched,
    // not just that dga got an error while the write still landed.
    const check = await pea.request.get(WEBX_STUDIO + "/api/cms/entries/api::service.service/" + peaServiceId);
    expect(check.ok()).toBeTruthy();
    const row = await check.json();
    expect(row.title).not.toBe("hijacked by cross-tenant-isolation.spec.ts");
  });

  test("dga's own service list never includes a pea-tenant row", async () => {
    const res = await dga.request.get(WEBX_STUDIO + "/api/cms/entries/api::service.service?pageSize=100");
    expect(res.ok()).toBeTruthy();
    const { data } = await res.json();
    const leaked = data.find((d: any) => (d.documentId ?? d.id) === peaServiceId);
    expect(leaked, "pea's service must not appear in dga's own list").toBeUndefined();
  });

  // block-type/icon specifically: found missing from strapi-cms's own
  // SCOPED set in the 2026-09-12 audit (C3) — any tenant's editor could
  // read/write another tenant's custom block definitions. This is the
  // regression guard for that exact fix.
  test("dga cannot read pea's block-type by id (2026-09-12 audit fix)", async () => {
    const res = await dga.request.get(WEBX_STUDIO + "/api/cms/entries/api::block-type.block-type/" + peaBlockTypeId);
    expect(res.status(), "cross-tenant read of a block-type must not succeed").not.toBe(200);
  });

  test("dga cannot update or delete pea's block-type (2026-09-12 audit fix)", async () => {
    const update = await dga.request.put(WEBX_STUDIO + "/api/cms/entries/api::block-type.block-type/" + peaBlockTypeId, {
      data: { name: "hijacked" },
    });
    expect(update.status()).not.toBe(200);

    const del = await dga.request.delete(WEBX_STUDIO + "/api/cms/entries/api::block-type.block-type/" + peaBlockTypeId);
    expect(del.status()).not.toBe(200);

    // Confirm as pea it's genuinely still there and unmodified.
    const check = await pea.request.get(WEBX_STUDIO + "/api/cms/entries/api::block-type.block-type/" + peaBlockTypeId);
    expect(check.ok()).toBeTruthy();
    const row = await check.json();
    expect(row.name).toBe("E2E isolation check");
  });

  test("dga's own block-type list never includes pea's block-type", async () => {
    const res = await dga.request.get(WEBX_STUDIO + "/api/cms/entries/api::block-type.block-type?pageSize=200");
    expect(res.ok()).toBeTruthy();
    const { data } = await res.json();
    const leaked = data.find((d: any) => (d.documentId ?? d.id) === peaBlockTypeId);
    expect(leaked, "pea's block-type must not appear in dga's own list").toBeUndefined();
  });
});
