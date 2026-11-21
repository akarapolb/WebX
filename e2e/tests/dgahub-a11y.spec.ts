import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// WCAG 2.1 AA check (axe-core) of the dgahub hub's main pages, Thai and
// English, in light and dark mode. Runs against any copy of the hub:
//   HUB_URL=http://localhost:3100 npx playwright test tests/dgahub-a11y.spec.ts   (dev server)
//   HUB_URL=http://localhost:8095 ...                                              (served static export)
// A failure lists each rule, its impact and the first offending elements.
const HUB = (process.env.HUB_URL || "http://localhost:3100").replace(/\/$/, "");

export const HUB_PAGES = [
  "/dgahub", "/dgahub/overview", "/dgahub/indices", "/dgahub/dashboard", "/dgahub/policy", "/dgahub/services",
  "/dgahub/knowledge", "/dgahub/open-data", "/dgahub/about", "/dgahub/news", "/dgahub/search?q=EGDI", "/dgahub/404",
  "/en/dgahub", "/en/dgahub/overview", "/en/dgahub/indices", "/en/dgahub/dashboard", "/en/dgahub/services",
  "/en/dgahub/open-data", "/en/dgahub/news", "/en/dgahub/search?q=EGDI",
];

for (const theme of ["light", "dark"] as const) {
  test.describe(`dgahub WCAG 2.1 AA (${theme})`, () => {
    test.use({ colorScheme: theme });
    for (const path of HUB_PAGES) {
      test(`${path} has no axe violations`, async ({ page }) => {
        // Start each page with no saved theme, so prefers-color-scheme decides,
        // and with the cookie banner answered (it is checked once, on the home page).
        await page.addInitScript((keep) => {
          try { localStorage.removeItem("dh-theme"); if (!keep) localStorage.setItem("webx_consent", JSON.stringify({ action: "necessary", categories: { necessary: true, analytics: false, marketing: false }, at: "2026-01-01T00:00:00Z" })); } catch {}
        }, path === "/dgahub");
        await page.goto(HUB + path, { waitUntil: "networkidle" });
        await expect(page.locator("main#main-content")).toBeVisible();
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          // Next.js dev-only overlay (not in a static build).
          .exclude("nextjs-portal")
          .analyze();
        const report = results.violations.map((v) =>
          `${v.id} [${v.impact}] ${v.help}\n` + v.nodes.slice(0, 4).map((n) => `    ${n.target.join(" ")} — ${n.failureSummary?.split("\n").slice(1, 2).join(" ").trim()}`).join("\n"));
        expect(report, report.join("\n")).toEqual([]);
      });
    }
  });
}
