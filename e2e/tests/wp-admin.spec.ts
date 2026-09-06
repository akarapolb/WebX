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

  // TOR e2e pass finding: org-unit registers 'supports' => ['title','editor']
  // only — no 'excerpt' (see custom-post-types.php; it's a pure metadata
  // record, order/tenant/etc all live in its ACF group instead) — so
  // WordPress never renders a native #excerpt meta box for it at all. The
  // original version of this test assumed one existed and timed out
  // waiting for it. Retargeted to the native #content field instead, which
  // genuinely exists (and — a second, real bug found alongside this one —
  // org-unit/mission-item/timeline-event/document previously rendered
  // *blank* here: their post_content is always empty in practice, and on
  // an empty-content record the block editor's iframe canvas never
  // received its resize bridge, collapsing it to height:0 even though the
  // title/content were correctly present in the iframe's own DOM. Fixed by
  // routing these four metadata-only types to the classic editor instead
  // of chasing that resize-bridge bug — see custom-post-types.php's
  // use_block_editor_for_post_type filter — which has no iframe and isn't
  // subject to it, and is all a wp-admin user actually needs here since
  // the real fields live in the ACF meta boxes either way.
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
    // The classic editor's #content textarea holds the raw HTML source, but
    // WordPress hides it (display:none) whenever the "Visual" tab is active,
    // replacing it visually with a TinyMCE iframe — so it exists in the DOM
    // but isn't fill()-able until "Text" mode is selected.
    await page.locator("#content-html").click();
    const contentLocator = page.locator("#content");
    await expect(contentLocator).toBeVisible({ timeout: 10_000 });
    const original = await contentLocator.inputValue();
    const marker = " [e2e-check]";
    await contentLocator.fill(original + marker);

    await page.getByRole("button", { name: "Update" }).first().click();
    await expect(page.locator(".notice-success, #message.updated")).toBeVisible({ timeout: 10_000 });

    // context=edit needs cookie/nonce auth the bare `request` fixture doesn't
    // carry (it's a separate context from the logged-in `page`) — a real gap
    // never previously exercised, since the original #excerpt locator always
    // timed out before reaching this REST check. org-unit posts are publicly
    // published, so the default view context (no auth needed) already
    // exposes the rendered content, which is all this needs to verify.
    const postId = new URL(page.url()).searchParams.get("post");
    const resp = await request.get(`${WORDPRESS_URL}/wp-json/wp/v2/org-unit/${postId}`);
    expect(resp.ok()).toBeTruthy();
    const entry = await resp.json();
    expect(entry.content?.rendered || "").toContain("e2e-check");

    // Restore, so re-runs stay idempotent.
    await page.goto(WORDPRESS_URL + `/wp-admin/post.php?post=${postId}&action=edit`);
    await page.locator("#content").fill(original);
    await page.getByRole("button", { name: "Update" }).first().click();
    await expect(page.locator(".notice-success, #message.updated")).toBeVisible({ timeout: 10_000 });
  });
});
