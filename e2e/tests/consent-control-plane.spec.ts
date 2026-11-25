import { test, expect, type BrowserContext } from "@playwright/test";
import {
  WEBX_STUDIO, STRAPI_SCHEDULER_PASSWORD,
  DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD,
  PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD,
} from "./_helpers";

// Track C5 (docs/target-architecture.md), the first visitors' route: a visitor's browser posts its cookie choice to
// webx-control (POST /api/consent-logs), and Studio's screens read it from there.
//   - the post is made the way the public site's browser makes it (from an origin webx-control allows, no sign-in);
//   - the Cookie Consent screen's API lists an editor their own workspace's choices (control plane and Strapi together)
//     and no other workspace's, and reads one by id only inside its workspace;
//   - the choices cannot be edited or deleted through Studio;
//   - with Strapi given the same control plane (ANALYTICS_READS_CONTROL=1), the dashboard's cookie numbers and its
//     recent activity come from there too, and the monthly report still builds.
// Same stack as audit-control-plane.spec.ts: AUDIT_CONTROL_URL / AUDIT_CONTROL_TOKEN.
const CONTROL = (process.env.AUDIT_CONTROL_URL || "").replace(/\/$/, "");
const TOKEN = process.env.AUDIT_CONTROL_TOKEN || "";
const CL = "api::consent-log.consent-log";
// the public site's development origin, one webx-control allows by default
const SITE = "http://localhost:3100";

test.describe("Cookie consent in the control plane", () => {
  test.skip(
    !CONTROL || !TOKEN || !DGA_EDITOR_PASSWORD || !PEA_EDITOR_PASSWORD || !STRAPI_SCHEDULER_PASSWORD,
    "AUDIT_CONTROL_URL, AUDIT_CONTROL_TOKEN, DGA_EDITOR_PASSWORD, PEA_EDITOR_PASSWORD and STRAPI_SCHEDULER_PASSWORD required"
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

  const stamp = Date.now();
  // one address per post: the route is rate-limited per address (X-Forwarded-For)
  let n = 0;
  const visit = (tenant: string, data: object) =>
    fetch(`${CONTROL}/api/consent-logs?tenant=${tenant}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SITE, "x-forwarded-for": `10.77.${stamp % 250}.${++n}` },
      body: JSON.stringify({ data }),
    });
  const control = (path: string, init: RequestInit = {}) =>
    fetch(`${CONTROL}/internal${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers || {}) } });

  let dga: BrowserContext;
  let pea: BrowserContext;
  let dgaPost: Response;
  let dgaId = "";
  let peaId = "";
  const dgaConsentId = `e2e-dga-${stamp}`;
  const peaConsentId = `e2e-pea-${stamp}`;
  const summary = async (ctx: BrowserContext, tenant: string) => {
    const r = await ctx.request.get(`${WEBX_STUDIO}/api/strapi/api/analytics/summary?tenant=${tenant}`);
    expect(r.ok(), `the analytics summary answered ${r.status()}`).toBeTruthy();
    return r.json();
  };
  const analyticsFromControl = process.env.ANALYTICS_READS_CONTROL === "1";
  let consentBefore: any;

  test.beforeAll(async ({ browser }) => {
    [dga, pea] = await Promise.all([
      loginAs(browser, DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD),
      loginAs(browser, PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD),
    ]);
    if (analyticsFromControl) consentBefore = (await summary(dga, "dga")).consent;
    dgaPost = await visit("dga", { consentId: dgaConsentId, action: "accept_all", categories: { necessary: true, analytics: true, marketing: false }, language: "th", path: "/", userAgent: "e2e" });
    const peaPost = await visit("pea", { consentId: peaConsentId, action: "reject_all", categories: { necessary: true, analytics: false, marketing: false }, language: "th", path: "/pea", userAgent: "e2e" });
    expect(dgaPost.status, "the visitor's post is accepted").toBe(201);
    expect(peaPost.status).toBe(201);
    dgaId = (await dgaPost.clone().json()).data.documentId;
    peaId = (await peaPost.json()).data.documentId;
  });

  test.afterAll(async () => {
    await dga?.close();
    await pea?.close();
  });

  test("the control plane answers a visitor's browser: a preflight, and the post names the public site's origin", async () => {
    const pre = await fetch(`${CONTROL}/api/consent-logs?tenant=dga`, { method: "OPTIONS", headers: { origin: SITE, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(dgaPost.headers.get("access-control-allow-origin"), "the post itself carries the origin").toBe(SITE);
    const stranger = await fetch(`${CONTROL}/api/consent-logs?tenant=dga`, { method: "OPTIONS", headers: { origin: "https://evil.example.com", "access-control-request-method": "POST" } });
    expect(stranger.headers.get("access-control-allow-origin"), "an origin that is not listed is not allowed").toBeNull();
  });

  const consentIds = async (ctx: BrowserContext) => {
    const r = await ctx.request.get(`${WEBX_STUDIO}/api/cms/entries/${CL}?pageSize=200&sort=createdAt:DESC`);
    expect(r.ok(), `the consent list answered ${r.status()}`).toBeTruthy();
    return ((await r.json()).data as any[]).map((x) => x.consentId as string);
  };

  test("the Cookie Consent list shows an editor their workspace's choices from the control plane, and no other workspace's", async () => {
    const mine = await consentIds(dga);
    expect(mine, "dga sees its own choice").toContain(dgaConsentId);
    expect(mine, "dga does not see pea's").not.toContain(peaConsentId);
    const theirs = await consentIds(pea);
    expect(theirs).toContain(peaConsentId);
    expect(theirs, "pea does not see dga's").not.toContain(dgaConsentId);
  });

  test("a choice is read by id inside its workspace only", async () => {
    const own = await dga.request.get(`${WEBX_STUDIO}/api/cms/entries/${CL}/${dgaId}`);
    expect(own.ok(), `own choice answered ${own.status()}`).toBeTruthy();
    const body = await own.json();
    const row = body.data ?? body;
    expect(row.consentId).toBe(dgaConsentId);
    const other = await pea.request.get(`${WEBX_STUDIO}/api/cms/entries/${CL}/${dgaId}`);
    expect(other.ok(), "another workspace must not read it").toBeFalsy();
    expect([403, 404]).toContain(other.status());
  });

  test("a choice cannot be edited or deleted through Studio", async () => {
    const edit = await dga.request.put(`${WEBX_STUDIO}/api/cms/entries/${CL}/${dgaId}`, { data: { action: "reject_all" } });
    expect(edit.ok(), "editing a consent row must be refused").toBeFalsy();
    const del = await dga.request.delete(`${WEBX_STUDIO}/api/cms/entries/${CL}/${dgaId}`);
    expect(del.ok(), "deleting a consent row must be refused").toBeFalsy();
    const kept = (await (await control(`/records/consent-log/${dgaId}`)).json()).data;
    expect(kept.action, "the row is unchanged").toBe("accept_all");
    expect(kept.tenantKey).toBe("dga");
  });

  test("the dashboard's cookie numbers include the control plane's, and its recent activity comes from there", async () => {
    test.skip(!analyticsFromControl, "ANALYTICS_READS_CONTROL=1 (Strapi started with WEBX_CONTROL_URL and WEBX_CONTROL_SERVICE_TOKEN) required");
    const after = (await summary(dga, "dga")).consent;
    expect(after.total - consentBefore.total, "one more choice for dga").toBe(1);
    expect(after.accept - consentBefore.accept, "and it is an accept").toBe(1);
    expect(after.reject, "pea's rejection is not counted for dga").toBe(consentBefore.reject);

    // an audit row that exists only in the control plane is what the dashboard shows as recent activity
    const marker = "e2e.analytics." + stamp;
    const made = await control("/audit", { method: "POST", body: JSON.stringify({ data: { action: marker, tenantKey: "dga", adminEmail: DGA_EDITOR_EMAIL, contentType: "e2e", at: new Date().toISOString() } }) });
    expect(made.ok, `writing the audit row answered ${made.status}`).toBeTruthy();
    const recent = ((await summary(dga, "dga")).recentAudit as any[]).map((r) => r.action);
    expect(recent, "the dashboard reads the audit log from the control plane").toContain(marker);

    // the monthly report builds with the control plane configured (an .xlsx workbook)
    const month = new Date().toISOString().slice(0, 7);
    const report = await dga.request.get(`${WEBX_STUDIO}/api/strapi/api/analytics/report?month=${month}&tenant=dga`);
    expect(report.ok(), `the report answered ${report.status()}`).toBeTruthy();
    expect(report.headers()["content-type"]).toContain("spreadsheetml");
  });
});
