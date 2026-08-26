import { test, expect } from "@playwright/test";
import { PUBLIC_SITE, TENANT_PAGES, PLACEHOLDER_PATTERN } from "./_helpers";

// Every page on both tenants: loads, no console errors, no leftover
// placeholder markers, header/main/footer landmarks present, no broken
// image responses. This is the fast, deterministic layer — it runs against
// the already-built static export (see playwright.config.ts's webServer),
// not a live dev server, so it's testing exactly what would ship.
for (const [tenant, pages] of Object.entries(TENANT_PAGES)) {
  test.describe(`${tenant} public site`, () => {
    for (const path of pages) {
      const url = `/${tenant}${path}`;

      test(`${url || "/" + tenant} renders cleanly`, async ({ page }) => {
        const consoleErrors: string[] = [];
        const failedRequests: string[] = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        page.on("requestfailed", (req) => failedRequests.push(req.url()));
        page.on("response", (res) => {
          if (res.request().resourceType() === "image" && res.status() >= 400) {
            failedRequests.push(`${res.status()} ${res.url()}`);
          }
        });

        const response = await page.goto(PUBLIC_SITE + url);
        expect(response?.status(), `${url} should return 200`).toBe(200);

        // Landmarks — every template wraps content in these regardless of
        // the Phase 10 redesign's specific markup, so this stays stable
        // across visual rebuilds.
        await expect(page.locator("header, [id*=header], [class*=header]").first()).toBeVisible();
        await expect(page.locator("main, #main-content").first()).toBeVisible();
        await expect(page.locator("footer, [id*=footer], [class*=footer]").first()).toBeVisible();

        const bodyText = await page.locator("body").innerText();
        const placeholderMatch = bodyText.match(PLACEHOLDER_PATTERN);
        expect(placeholderMatch, `${url} should have no leftover bracketed placeholder text (found: ${placeholderMatch?.[0]})`).toBeNull();
        expect(bodyText.trim().length, `${url} should have real rendered content`).toBeGreaterThan(200);

        expect(consoleErrors, `${url} should have no console errors`).toEqual([]);
        expect(failedRequests, `${url} should have no failed image/resource requests`).toEqual([]);
      });
    }
  });

  test(`${tenant} nav does not overlap at common widths`, async ({ page }) => {
    // Regression guard for the exact bug found and fixed in Phase 9/10:
    // header nav items overlapping the logo/actions at 1200-1700px. Checks
    // that no two direct children of the header's nav row visually overlap.
    for (const width of [375, 768, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(PUBLIC_SITE + `/${tenant}`);
      const overlap = await page.evaluate(() => {
        const header = document.querySelector("header, [id*=header]");
        if (!header) return null;
        // visibility:hidden (unlike display:none) keeps an element's layout
        // box, so a closed mega-menu/dropdown's own links can share space
        // with each other and still pass a width/height>0 filter — exclude
        // them explicitly rather than flagging content nobody can see.
        const boxes = [...header.querySelectorAll("a, button")]
          .filter((el) => {
            const cs = getComputedStyle(el);
            return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
          })
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0);
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            const overlapsX = a.left < b.right - 2 && b.left < a.right - 2;
            const overlapsY = a.top < b.bottom - 2 && b.top < a.bottom - 2;
            if (overlapsX && overlapsY) return { a: [a.left, a.right], b: [b.left, b.right] };
          }
        }
        return null;
      });
      expect(overlap, `header controls should not overlap at ${width}px`).toBeNull();
    }
  });
}
