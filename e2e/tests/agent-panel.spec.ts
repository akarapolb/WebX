import { test, expect } from "@playwright/test";
import { WEBX_STUDIO, STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD } from "./_helpers";

// UI-level coverage for the docked agent panel (components/agent/AgentPanel.tsx
// + AgentProvider.tsx) and the /agent workspace — entirely through
// page.route() mocks of /api/agent/*, so this suite needs no LiteLLM, no
// mock-litellm.mjs process, and no tenant plan/policy setup: it exercises
// the CLIENT's own state machine (open/close persistence, SSE parsing into
// the message list, proposal Apply gating) against canned responses, the
// same way agent.spec.ts exercises the real backend contract those canned
// responses are shaped to match.
//
// Still needs a real session cookie (middleware.ts gates every route on
// one) — reuses the scheduler account's login, same as user-management.spec.ts;
// which tenant it resolves to doesn't matter since every agent-related call
// is mocked below regardless of tenant.
test.skip(!STRAPI_SCHEDULER_PASSWORD, "STRAPI_SCHEDULER_PASSWORD not set — see e2e/README.md");

function sse(events: { type: string; [k: string]: any }[]): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

test.describe("WebX Agent — docked panel + workspace (mocked backend)", () => {
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

  test.beforeEach(async ({ context }) => { await context.addCookies(sessionState.cookies); });

  test("toggle, ⌘/Ctrl+J, and open state persist across a reload", async ({ page }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "draft", model: "", tools: null, contentTypes: null } }));
    await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));

    await page.goto(WEBX_STUDIO + "/dashboard");
    const panel = page.locator(".ag");
    const toggle = page.getByTestId("agent-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await expect(panel).toHaveAttribute("aria-hidden", "true"); // closed by default, no prior localStorage

    await toggle.click();
    await expect(panel).toHaveAttribute("aria-hidden", "false");

    await page.keyboard.press("Control+j");
    await expect(panel).toHaveAttribute("aria-hidden", "true");

    await toggle.click();
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await page.reload();
    await expect(page.locator(".ag")).toHaveAttribute("aria-hidden", "false", { timeout: 10_000 }); // localStorage survived the reload
  });

  test("a streamed assistant reply renders in the message list", async ({ page }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "draft", model: "mock-model" } }));
    await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/agent/run", (route) => route.fulfill({
      status: 200, contentType: "text/event-stream",
      body: sse([
        { type: "run_started", runId: "r1", threadId: "t1", level: "draft", model: "mock-model" },
        { type: "text", content: "Hello from the mocked agent." },
        { type: "usage", promptTokens: 10, completionTokens: 5 },
        { type: "done", runId: "r1" },
      ]),
    }));

    await page.goto(WEBX_STUDIO + "/dashboard");
    await page.getByTestId("agent-toggle").click();
    const composer = page.getByTestId("agent-composer");
    await expect(composer).toBeVisible({ timeout: 10_000 });
    await composer.fill("Write me something");
    await page.getByTestId("agent-send").click();

    await expect(page.getByText("Hello from the mocked agent.")).toBeVisible({ timeout: 10_000 });
  });

  test("a proposal targeting a closed entry renders with Apply disabled", async ({ page }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "draft", model: "" } }));
    await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/agent/run", (route) => route.fulfill({
      status: 200, contentType: "text/event-stream",
      body: sse([
        { type: "run_started", runId: "r2", threadId: "t2", level: "draft", model: "" },
        { type: "tool_call", id: "c1", name: "write_draft_fields", args: {} },
        { type: "tool_result", id: "c1", ok: true, summary: "Proposed 1 field change(s)" },
        { type: "proposal", proposal: { id: "p1", kind: "fields", target: { uid: "api::article.article", id: "not-open-anywhere" }, title: "Field changes", fields: { title: "New Title" } } },
        { type: "done", runId: "r2" },
      ]),
    }));

    await page.goto(WEBX_STUDIO + "/dashboard");
    await page.getByTestId("agent-toggle").click();
    await page.getByTestId("agent-composer").fill("Update the title");
    await page.getByTestId("agent-send").click();

    // The tool-call row and the proposal card both render from the mocked
    // stream, and — since no editor is registered for api::article.article
    // #not-open-anywhere — targetMatches() correctly leaves Apply disabled
    // rather than letting a stale/wrong-target click through.
    await expect(page.getByText("write_draft_fields")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Field changes")).toBeVisible();
    const applyBtn = page.getByRole("button", { name: "Apply" });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toBeDisabled();
    await expect(page.getByText("Open this item to apply")).toBeVisible();
  });

  test("policy \"off\" hides the toggle entirely and shows the empty state with no composer", async ({ page, context }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "off", reason: "plan" } }));
    // At level "off", Shell.tsx's topbar toggle and AgentPanel's own FAB
    // both render nothing at all — there is no UI control left to open the
    // panel through, by design. Force it open via the same localStorage key
    // AgentProvider itself reads, so the (still CSS-hidden-until-open) empty
    // state can be asserted on directly instead of only proving the panel
    // is unreachable.
    await context.addInitScript(() => localStorage.setItem("webx_agent_open", "1"));

    await page.goto(WEBX_STUDIO + "/dashboard");
    await expect(page.getByTestId("agent-toggle")).toHaveCount(0);
    await expect(page.locator(".ag-fab")).toHaveCount(0);
    await expect(page.getByTestId("agent-empty")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("agent-composer")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View plans" })).toBeVisible();
  });

  test("/agent workspace hydrates the thread list and honors the Settings tab", async ({ page }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "suggest", model: "" } }));
    await page.route("**/api/agent/threads", (route) => route.fulfill({
      json: [{ id: 1, documentId: "th1", title: "A past conversation", runState: "done", updatedAt: new Date().toISOString() }],
    }));

    await page.goto(WEBX_STUDIO + "/agent");
    await expect(page.getByRole("heading", { name: "Agent" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("agent-thread-th1")).toBeVisible();
    await expect(page.getByText("A past conversation")).toBeVisible();

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Agent autonomy")).toBeVisible({ timeout: 10_000 });
  });
});
