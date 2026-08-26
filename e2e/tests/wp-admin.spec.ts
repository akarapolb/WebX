import { test, expect } from "@playwright/test";
import { WORDPRESS_URL, WP_ADMIN_USER } from "./_helpers";

// Direct WordPress admin edit, bypassing WebX Studio entirely — confirms
// ACF's own native meta-box editing UI works for the Phase 10 content
// types, which is the other half of "editable both in WebX Studio and
// WordPress admin" from the Phase 10 plan.
//
// Needs the wp-admin user's real interactive password (NOT the REST
// Application Password used elsewhere in this suite — WordPress
// deliberately rejects Application Passwords on the wp-login.php form).
// Set WP_ADMIN_PASSWORD yourself in your shell before running this suite;
// it's never read from a committed file. See e2e/README.md.
const WP_ADMIN_PASSWORD = process.env.WP_ADMIN_PASSWORD || "";

test.describe("WordPress admin direct edit", () => {
  test.skip(!WP_ADMIN_PASSWORD, "WP_ADMIN_PASSWORD not set — see e2e/README.md");

  test("editing an Org Unit's fields directly in wp-admin persists via REST", async ({ page, request }) => {
    await page.goto(WORDPRESS_URL + "/wp-login.php");
    await page.getByLabel("Username or Email Address").fill(WP_ADMIN_USER);
    await page.getByLabel("Password", { exact: true }).fill(WP_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page).toHaveURL(/wp-admin/, { timeout: 15_000 });

    await page.goto(WORDPRESS_URL + "/wp-admin/edit.php?post_type=org-unit");
    const firstRow = page.locator(".wp-list-table tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.locator(".row-title, a.row-title, td.title a").first().click();

    await expect(page).toHaveURL(/post\.php\?post=\d+&action=edit/, { timeout: 10_000 });
    const excerptLocator = page.locator("#excerpt");
    const original = (await excerptLocator.count()) ? await excerptLocator.inputValue() : "";
    const marker = " [e2e-check]";
    await excerptLocator.fill(original + marker);

    await page.getByRole("button", { name: "Update" }).first().click();
    await expect(page.locator(".notice-success, #message.updated")).toBeVisible({ timeout: 10_000 });

    const postId = new URL(page.url()).searchParams.get("post");
    const resp = await request.get(`${WORDPRESS_URL}/wp-json/wp/v2/org-unit/${postId}?context=edit`);
    expect(resp.ok()).toBeTruthy();
    const entry = await resp.json();
    expect(entry.excerpt?.rendered || "").toContain("e2e-check");

    // Restore, so re-runs stay idempotent.
    await page.goto(WORDPRESS_URL + `/wp-admin/post.php?post=${postId}&action=edit`);
    await page.locator("#excerpt").fill(original);
    await page.getByRole("button", { name: "Update" }).first().click();
    await expect(page.locator(".notice-success, #message.updated")).toBeVisible({ timeout: 10_000 });
  });
});
