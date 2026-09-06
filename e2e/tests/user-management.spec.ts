import { test, expect } from "@playwright/test";
import {
  WEBX_STUDIO, WORDPRESS_URL, STRAPI_URL, WP_ADMIN_USER, WP_ADMIN_APP_PASSWORD,
  STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD,
} from "./_helpers";

// Covers the centralized user-management feature (create/list/remove users
// for any workspace, including a WordPress-engine one reached through a
// Strapi session) and the Status page's "Rebuild now" control. Logs in as
// the seeded scheduler service account (a real Strapi super-admin — see
// strapi-cms/src/seed/seed.ts's seedScheduler), the one Strapi login this
// repo already guarantees exists in any dev setup, rather than provisioning
// a dedicated e2e account.
//
// Requires STRAPI_SCHEDULER_PASSWORD (matches webx-studio's own .env.local)
// and, for the WordPress round-trip test specifically, WP_ADMIN_APP_PASSWORD
// (same requirement as studio-roundtrip.spec.ts) to verify against WordPress
// directly rather than trusting the UI's own claim.
test.describe("WebX Studio user management + public-site rebuild", () => {
  test.skip(!STRAPI_SCHEDULER_PASSWORD, "STRAPI_SCHEDULER_PASSWORD not set — see e2e/README.md");

  // Logs in ONCE for the whole file, not per test — Strapi's own
  // /admin/login rate limiter trips easily in this dev environment (see the
  // scheduler-account comment in governance.ts) and 4 real logins back to
  // back was enough to hit it directly while writing this suite. The
  // session cookie is httpOnly, so it's captured via storageState and
  // seeded into each test's own page/context instead of re-authenticating.
  let sessionState: any;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(WEBX_STUDIO + "/login");
    await page.getByRole("tab", { name: "Strapi" }).click();
    await page.getByPlaceholder("admin@webx.io").fill(STRAPI_SCHEDULER_EMAIL);
    await page.getByPlaceholder("••••••••").fill(STRAPI_SCHEDULER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    sessionState = await context.storageState();
    await context.close();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies(sessionState.cookies);
  });

  test("Users & Roles workspace picker reaches a WordPress-engine tenant from a Strapi session", async ({ page }) => {
    // This is the whole point of Users & Roles having its own picker,
    // separate from the sidebar switcher: the sidebar deliberately excludes
    // WordPress-engine tenants (a Strapi session can't edit their CONTENT —
    // see strapi-cms's console controller), but user management has no such
    // restriction. If this were still routing through activeAdapter() (the
    // Strapi session's own engine) instead of the tenant's own engine, this
    // would 500 instead of listing real WordPress users.
    await page.goto(WEBX_STUDIO + "/users");
    const picker = page.getByTestId("users-workspace-picker");
    await expect(picker).toBeVisible({ timeout: 10_000 });

    const wpOption = picker.locator("option", { hasText: "(WordPress)" }).first();
    await expect(wpOption).toHaveCount(1);
    const wpValue = await wpOption.getAttribute("value");
    expect(wpValue).toBeTruthy();

    await picker.selectOption(wpValue!);
    await expect(page.getByTestId("user-row").first()).toBeVisible({ timeout: 10_000 });
  });

  test("creating and removing a user round-trips through WordPress", async ({ page, request }) => {
    test.skip(!WP_ADMIN_APP_PASSWORD, "WP_ADMIN_APP_PASSWORD not set — see e2e/README.md");

    await page.goto(WEBX_STUDIO + "/users");
    await page.getByTestId("users-workspace-picker").selectOption("orst");
    await expect(page.getByTestId("user-row").first()).toBeVisible({ timeout: 10_000 });

    const email = `e2e-wp-${Date.now()}@orst.local`;
    const auth = "Basic " + Buffer.from(`${WP_ADMIN_USER}:${WP_ADMIN_APP_PASSWORD}`).toString("base64");

    try {
      await page.getByTestId("add-user-btn").click();
      await page.getByTestId("new-user-firstname").fill("E2E");
      await page.getByTestId("new-user-lastname").fill("WpTest");
      await page.getByTestId("new-user-email").fill(email);
      await page.getByTestId("new-user-role").selectOption("editor");
      await page.getByTestId("create-user-submit").click();

      const pwEl = page.getByTestId("temp-password");
      await expect(pwEl).toBeVisible({ timeout: 15_000 });
      const tempPassword = (await pwEl.textContent()) || "";
      expect(tempPassword.length).toBeGreaterThan(8); // a real generated password, not an empty/placeholder string
      await page.getByTestId("temp-password-done").click();

      const row = page.getByTestId("user-row").filter({ hasText: email });
      await expect(row).toBeVisible({ timeout: 10_000 });

      // Verify directly against WordPress — the UI could be showing a stale
      // or wishful list, so confirm the account genuinely exists there too.
      const search = await request.get(
        `${WORDPRESS_URL}/wp-json/wp/v2/users?search=${encodeURIComponent(email)}&context=edit`,
        { headers: { Authorization: auth } }
      );
      expect(search.ok()).toBeTruthy();
      const found = (await search.json()).find((u: any) => u.email === email);
      expect(found, `${email} should be a real WordPress user`).toBeTruthy();
    } finally {
      // Always attempt cleanup, even if an assertion above failed midway —
      // an e2e run shouldn't accumulate throwaway admin accounts.
      const row = page.getByTestId("user-row").filter({ hasText: email });
      if (await row.count()) {
        await row.getByTestId("remove-user-btn").click();
        await row.getByTestId("remove-user-btn").click(); // second click confirms
        await expect(row).toHaveCount(0, { timeout: 10_000 });
      }
    }

    // Removing them should have deleted the underlying account too — this
    // was their only workspace membership, not just hidden it from the list.
    const after = await request.get(
      `${WORDPRESS_URL}/wp-json/wp/v2/users?search=${encodeURIComponent(email)}&context=edit`,
      { headers: { Authorization: auth } }
    );
    expect((await after.json()).length, `${email} should no longer exist in WordPress`).toBe(0);
  });

  test("creating and removing a user round-trips through Strapi", async ({ page, request }) => {
    await page.goto(WEBX_STUDIO + "/users");
    await page.getByTestId("users-workspace-picker").selectOption("dga");
    await expect(page.getByTestId("user-row").first()).toBeVisible({ timeout: 10_000 });

    const email = `e2e-strapi-${Date.now()}@dga.local`;

    try {
      await page.getByTestId("add-user-btn").click();
      await page.getByTestId("new-user-firstname").fill("E2E");
      await page.getByTestId("new-user-lastname").fill("StrapiTest");
      await page.getByTestId("new-user-email").fill(email);

      // Strapi's own role names/ids vary per instance — pick the first real
      // option (index 1, past the "Select a role…" placeholder) rather than
      // hardcoding one.
      const roleSelect = page.getByTestId("new-user-role");
      await expect(roleSelect.locator("option").nth(1)).toBeAttached({ timeout: 10_000 });
      const roleValue = await roleSelect.locator("option").nth(1).getAttribute("value");
      await roleSelect.selectOption(roleValue!);
      await page.getByTestId("create-user-submit").click();

      const pwEl = page.getByTestId("temp-password");
      await expect(pwEl).toBeVisible({ timeout: 15_000 });
      const tempPassword = (await pwEl.textContent()) || "";
      expect(tempPassword.length).toBeGreaterThan(8);
      await page.getByTestId("temp-password-done").click();

      const row = page.getByTestId("user-row").filter({ hasText: email });
      await expect(row).toBeVisible({ timeout: 10_000 });

      // A genuinely working, login-capable account (proves Strapi's
      // two-call create-then-activate flow actually left it usable) — not
      // just a UI claim.
      const loginResp = await request.post(`${STRAPI_URL}/admin/login`, { data: { email, password: tempPassword } });
      const loginBody = await loginResp.json();
      expect(loginBody?.data?.token, "the new Strapi user should be able to log in with its temp password").toBeTruthy();
    } finally {
      const row = page.getByTestId("user-row").filter({ hasText: email });
      if (await row.count()) {
        await row.getByTestId("remove-user-btn").click();
        await row.getByTestId("remove-user-btn").click();
        await expect(row).toHaveCount(0, { timeout: 10_000 });
      }
    }
  });

  test("Rebuild now forces a public-site rebuild", async ({ page }) => {
    test.setTimeout(180_000); // a real `next build` can run well past Playwright's default 30s

    await page.goto(WEBX_STUDIO + "/status");
    const lastBuiltEl = page.getByTestId("public-site-last-built");
    await expect(lastBuiltEl).toBeVisible({ timeout: 10_000 });
    const before = await lastBuiltEl.getAttribute("data-last-built");

    await page.getByTestId("rebuild-now-btn").click();

    // A real build takes well over a minute (observed: ~70s for this
    // site's ~118 pages) — asserting straight for data-building="false"
    // races the click: if that check's very first poll lands before
    // Status.tsx's own fetch/state-update from the click has landed,
    // "false" is still literally true from BEFORE the click, and the
    // assertion passes instantly without ever having observed a real
    // build cycle (found live: the whole test completed in ~2.5s while
    // the server log showed the actual rebuild still finishing a minute
    // later). Confirming the "true" transition first closes that race.
    const statusBadge = page.getByTestId("public-site-status");
    await expect(statusBadge).toHaveAttribute("data-building", "true", { timeout: 10_000 });
    await expect(statusBadge).toHaveAttribute("data-building", "false", { timeout: 150_000 });

    const after = await lastBuiltEl.getAttribute("data-last-built");
    expect(after, "lastBuiltAt should have advanced past its pre-click value").not.toBe(before);
    expect(after).toBeTruthy();
  });
});
