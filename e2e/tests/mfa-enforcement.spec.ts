import { test, expect, type APIRequestContext } from "@playwright/test";
import crypto from "crypto";
import { WEBX_STUDIO, STRAPI_URL, STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD, DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD } from "./_helpers";

// Per-tenant "require MFA" (governance.ts's saveMfaRequirement/mfaEnforcementStatus,
// off by default). Same "verify against the backend directly, not just optimistic
// UI state" discipline as agent.spec.ts, whose tenant-manipulation pattern this
// reuses: a real workspace admin (dga-editor) drives the actual UI, while a real
// scheduler admin token independently confirms what landed in Strapi and
// backdates the grace-period clock instead of waiting 14 real days.
const TENANT_UID = "api::tenant.tenant";

async function strapiLogin(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${STRAPI_URL}/admin/login`, { data: { email: STRAPI_SCHEDULER_EMAIL, password: STRAPI_SCHEDULER_PASSWORD } });
  expect(r.ok(), "scheduler login must succeed").toBeTruthy();
  return (await r.json()).data.token as string;
}

// Same RFC 6238 algorithm as lib/totp.ts's totp() (SHA1 HMAC, 30s step, 6
// digits) — ported here rather than imported, since totp.ts is `server-only`
// and this needs to generate a code as a real authenticator app would, from
// the secret the real /api/cms/mfa/start response returns.
function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.toUpperCase().replace(/=+$/, "")) { const v = alphabet.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, "0"); }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret: string): string {
  const key = base32Decode(secret);
  let counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

test.describe("Per-tenant MFA enforcement", () => {
  test.skip(!STRAPI_SCHEDULER_PASSWORD, "STRAPI_SCHEDULER_PASSWORD not set — see e2e/README.md");
  test.skip(!DGA_EDITOR_PASSWORD, "DGA_EDITOR_PASSWORD not set — see e2e/README.md");

  let schedulerToken = "";
  let tenantDocumentId = "";
  let originalFeatures: any = {};
  let originalSso: any = null;
  let sessionState: any;

  test.beforeAll(async ({ request, browser }) => {
    schedulerToken = await strapiLogin(request);
    const auth = { Authorization: "Bearer " + schedulerToken };

    const tenantsRes = await request.get(`${STRAPI_URL}/content-manager/collection-types/${TENANT_UID}?pageSize=200`, { headers: auth });
    const dga = ((await tenantsRes.json()).results ?? []).find((t: any) => t.key === "dga");
    expect(dga, "seeded dga tenant must exist").toBeTruthy();
    tenantDocumentId = dga.documentId;
    originalFeatures = dga.features || {};
    originalSso = dga.sso || null;

    // Clean baseline: MFA not required, SSO off (the toggle is hidden under SSO
    // — see MfaRequirement.tsx). Restored to the captured originals in afterAll.
    await request.put(`${STRAPI_URL}/content-manager/collection-types/${TENANT_UID}/${tenantDocumentId}`, {
      headers: { ...auth, "Content-Type": "application/json" },
      data: { features: { ...originalFeatures, security: undefined }, sso: { ...(originalSso || {}), enabled: false } },
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(WEBX_STUDIO + "/login");
    await page.getByRole("tab", { name: "Strapi" }).click();
    await page.getByPlaceholder("admin@webx.io").fill(DGA_EDITOR_EMAIL);
    await page.getByPlaceholder("••••••••").fill(DGA_EDITOR_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // If a stray prior run left dga-editor's own MFA enrolled, clear it so
    // the reminder/block states below are actually reachable.
    const status = await page.request.get(WEBX_STUDIO + "/api/cms/mfa/status").then((r) => r.json());
    if (status?.enabled) {
      await page.request.post(WEBX_STUDIO + "/api/cms/mfa/disable", {
        headers: { "Content-Type": "application/json" }, data: { password: DGA_EDITOR_PASSWORD },
      });
    }
    sessionState = await context.storageState();
    await context.close();
  });

  test.afterAll(async ({ request }) => {
    if (tenantDocumentId) {
      await request.put(`${STRAPI_URL}/content-manager/collection-types/${TENANT_UID}/${tenantDocumentId}`, {
        headers: { Authorization: "Bearer " + schedulerToken, "Content-Type": "application/json" },
        data: { features: originalFeatures, sso: originalSso ?? { enabled: false } },
      }).catch(() => {});
    }
  });

  test.beforeEach(async ({ context }) => { await context.addCookies(sessionState.cookies); });

  test("an admin requires MFA, an unenrolled admin is reminded then blocked, and enrolling from inside the block lifts it", async ({ page, request }) => {
    test.setTimeout(120_000); // includes a real 31s wait past the tenant cache's TTL — see step 5
    const auth = { Authorization: "Bearer " + schedulerToken };

    // 1. Starting state: not required, real UI toggle visible for this admin.
    await page.goto(WEBX_STUDIO + "/account/security");
    const panel = page.getByTestId("mfa-requirement");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("mfa-requirement-status")).toContainText("Not required");

    // 2. Turn it on via the real UI, not the API.
    await page.getByTestId("mfa-requirement-toggle").click();
    await expect(page.getByTestId("mfa-requirement-status")).toContainText("Required", { timeout: 10_000 });

    // 3. Confirm what actually landed in Strapi, not just optimistic UI state.
    // The content-manager get-by-id endpoint wraps its response as {data,
    // meta} — unlike the list endpoint's own {results, pagination} shape
    // used above in beforeAll for the initial lookup.
    const afterEnable = await request.get(`${STRAPI_URL}/content-manager/collection-types/${TENANT_UID}/${tenantDocumentId}`, { headers: auth }).then((r) => r.json()).then((j) => j.data);
    expect(afterEnable.features?.security?.mfaRequired).toBe(true);
    const requiredAt = Date.parse(afterEnable.features.security.mfaRequiredAt);
    expect(Date.now() - requiredAt).toBeLessThan(60_000);

    // 4. Elsewhere in the app: a non-blocking reminder, page content still reachable.
    await page.goto(WEBX_STUDIO + "/dashboard");
    await expect(page.getByTestId("mfa-banner")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("mfa-block")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // 5. Backdate the grace-period clock past its 14-day deadline instead of
    // waiting 14 real days. This goes straight to Strapi, bypassing
    // governance.ts entirely, so it does NOT call invalidateTenantCache() —
    // wait out the real 30s tenant-cache TTL (refreshTenantCache's own
    // constant) before relying on the app to see it, same as a real deploy
    // would after an external change.
    const backdatePut = await request.put(`${STRAPI_URL}/content-manager/collection-types/${TENANT_UID}/${tenantDocumentId}`, {
      headers: { ...auth, "Content-Type": "application/json" },
      data: { features: { ...afterEnable.features, security: { mfaRequired: true, mfaRequiredAt: new Date(Date.now() - 15 * 86_400_000).toISOString() } } },
    });
    expect(backdatePut.ok(), "backdating mfaRequiredAt must succeed").toBeTruthy();
    await page.waitForTimeout(31_000);

    // 6. A fresh page load (the layout's own server-side check) now blocks —
    // but sign-out must stay reachable, never a true lockout.
    await page.goto(WEBX_STUDIO + "/dashboard");
    await expect(page.getByTestId("mfa-block")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toHaveCount(0); // the real dashboard content is NOT rendered underneath
    await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible(); // the embedded enroll flow is
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

    // 7. Enroll from inside the block itself (the real MFA flow, embedded).
    const [startResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/cms/mfa/start") && r.ok()),
      page.getByTestId("mfa-block").getByTestId("mfa-enable").click(),
    ]);
    const { secret } = await startResp.json();
    expect(secret, "a real TOTP secret must come back").toBeTruthy();

    await page.getByTestId("mfa-code-input").fill(totp(secret));
    await page.getByTestId("mfa-confirm").click();

    // The recovery codes must actually be shown — not skipped past — before the block lifts.
    await expect(page.getByText("Save your recovery codes")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("mfa-block")).toBeVisible(); // still blocked: not acknowledged yet
    await page.getByTestId("mfa-recovery-done").click();

    // 8. The block lifts immediately, client-side, with no reload.
    await expect(page.getByTestId("mfa-block")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("mfa-banner")).toHaveCount(0);

    // 9. And the server-side check agrees on a real reload — not just local state.
    await page.goto(WEBX_STUDIO + "/dashboard");
    await expect(page.getByTestId("mfa-block")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // 10. Turn the requirement back off, confirmed via the API too.
    await page.goto(WEBX_STUDIO + "/account/security");
    await expect(page.getByTestId("mfa-requirement")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("mfa-requirement-toggle").click();
    await expect(page.getByTestId("mfa-requirement-status")).toContainText("Not required", { timeout: 10_000 });
    const afterDisable = await request.get(`${STRAPI_URL}/content-manager/collection-types/${TENANT_UID}/${tenantDocumentId}`, { headers: auth }).then((r) => r.json()).then((j) => j.data);
    expect(afterDisable.features?.security?.mfaRequired).toBe(false);

    // 11. Real cleanup of the account's OWN MFA enrollment too — otherwise
    // this seeded dev account would need a TOTP code to sign in from now on.
    await expect(page.getByText("Two-factor authentication is on")).toBeVisible();
    await page.getByTestId("mfa-disable-password").fill(DGA_EDITOR_PASSWORD);
    await page.getByTestId("mfa-disable").click();
    await expect(page.getByText("Two-factor authentication is off")).toBeVisible({ timeout: 10_000 });
  });
});
