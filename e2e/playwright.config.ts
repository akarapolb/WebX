import { defineConfig, devices } from "@playwright/test";

// This repo has no orchestration for its 4 separately-managed services
// (Strapi, WordPress-in-Docker, webx-studio, public-site) — all 4 are
// manual pre-flight steps (see e2e/README.md), not something Playwright
// starts itself. Deliberately NOT using Playwright's `webServer` option
// for public-site: it runs `next build`, which races destructively against
// anyone else editing public-site source while the suite runs (observed
// directly during Phase 10's redesign work) — a plain `reuseExistingServer`
// dev/serve process you start yourself avoids that entirely.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // content-mutating tests (studio/wp-admin round trips) shouldn't race each other
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
