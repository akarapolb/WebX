import { test, expect } from "@playwright/test";
import { WEBX_STUDIO, WORDPRESS_URL, WP_ADMIN_USER, WP_ADMIN_APP_PASSWORD } from "./_helpers";

// Full pipeline: log into WebX Studio (WordPress engine), open a real
// ACF-backed entry (Mission Item — a Phase 10 content type), edit its
// numeric "Order" field, save as draft, then verify the change landed in
// WordPress via a direct REST fetch. Verifying against REST directly (not
// waiting for the debounced public-site rebuild) keeps this fast and
// deterministic — see the Phase 10 plan for that call.
//
// Requires WP_ADMIN_APP_PASSWORD env var (a real WordPress user's
// Application Password — Users -> Profile -> Application Passwords in
// wp-admin). Skips with a clear message if not set, rather than failing
// opaquely, since this credential can't be committed to the repo.
test.describe("WebX Studio round trip (WordPress engine)", () => {
  test.skip(!WP_ADMIN_APP_PASSWORD, "WP_ADMIN_APP_PASSWORD not set — see e2e/README.md");

  test("editing a Mission Item's Order field in WebX Studio persists to WordPress", async ({ page, request }) => {
    await page.goto(WEBX_STUDIO + "/login");
    await page.getByRole("tab", { name: "WordPress" }).click();
    await page.getByPlaceholder("org-editor").fill(WP_ADMIN_USER);
    await page.getByPlaceholder("xxxx xxxx xxxx xxxx").fill(WP_ADMIN_APP_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto(WEBX_STUDIO + "/content");
    // Selecting a content type in the sidebar re-fetches its entries
    // asynchronously and the table can briefly still show the PREVIOUSLY
    // selected type's rows (observed: clicking a row right after selecting
    // "Mission Item" sometimes opened a leftover "Post" row instead, which
    // 404'd when the editor tried to load it as a mission-item — a real
    // ContentBrowser race, not just test timing, since waiting for the
    // network response alone wasn't enough to avoid it). Sidestep the race
    // entirely by waiting for a known real seeded title's row to actually
    // render, then clicking THAT row by name — deterministic regardless of
    // how many stale re-renders happen first.
    await page.getByText("Mission Item", { exact: true }).click();
    // The same seed content was deliberately reused for both tenants (real
    // org, same real mission copy — see the Phase 10 plan), so this title
    // matches 2 rows when the account can see both; either is a valid
    // mission-item to round-trip through, so .first() is fine here.
    const knownRow = page.locator("table tbody tr, [role=row]").filter({ hasText: "บริการทางวิชาการ" }).first();
    await expect(knownRow).toBeVisible({ timeout: 15_000 });
    await knownRow.click();
    // EntryEditor tags each field input with data-testid="field-<key>" (the
    // raw entry key, e.g. ACF's "order") — see components/EntryEditor.tsx.
    const orderInput = page.getByTestId("field-order");
    await expect(orderInput).toBeVisible({ timeout: 10_000 });
    // Next dev mode runs React StrictMode, which double-invokes EntryEditor's
    // fetch-on-mount effect — both calls resolve and each calls setFields(),
    // so an edit typed between the first resolution and the second gets
    // silently clobbered back to server truth (observed directly: fill()
    // succeeds, "No changes to save" fires anyway seconds later). This is a
    // dev-mode-only artifact (StrictMode doesn't double-invoke in production
    // builds), not a real app bug — waiting for the network to go quiet
    // before editing lets both fetches settle first.
    await page.waitForLoadState("networkidle");

    const original = await orderInput.inputValue();
    const updated = String((Number(original) || 0) + 1);
    await orderInput.fill(updated);
    await expect(orderInput).toHaveValue(updated); // catch the edit not sticking before blaming the save
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Edit Mission Item")).toHaveCount(0, { timeout: 10_000 }); // modal closed

    // Read the entry id from the network response the editor itself made
    // (avoids re-deriving it from the UI) — simplest reliable path is to
    // grep the page's own state via a REST list call scoped the same way
    // the editor is, then find the entry whose acf.order now matches.
    const auth = "Basic " + Buffer.from(`${WP_ADMIN_USER}:${WP_ADMIN_APP_PASSWORD}`).toString("base64");
    const listResp = await request.get(`${WORDPRESS_URL}/wp-json/wp/v2/mission-item?per_page=50&context=edit`, {
      headers: { Authorization: auth },
    });
    expect(listResp.ok()).toBeTruthy();
    const rows = await listResp.json();
    const matched = rows.find((r: any) => String(r.acf?.order) === updated);
    expect(matched, `a mission-item with acf.order=${updated} should exist in WordPress after saving`).toBeTruthy();

    // Restore the original value so re-runs stay idempotent and don't
    // permanently drift seeded content.
    await request.post(`${WORDPRESS_URL}/wp-json/wp/v2/mission-item/${matched.id}`, {
      headers: { Authorization: auth, "Content-Type": "application/json" },
      data: { acf: { order: Number(original) || 0 } },
    });
  });
});
