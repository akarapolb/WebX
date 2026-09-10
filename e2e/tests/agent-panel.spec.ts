import { test, expect } from "@playwright/test";
import { WEBX_STUDIO, STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD } from "./_helpers";

// UI-level coverage for the docked agent panel (components/agent/AgentPanel.tsx
// + AgentProvider.tsx) and the /agent workspace — entirely through
// page.route() mocks of /api/agent/*, so this suite needs no LiteLLM, no
// mock LLM server, and no tenant plan/policy setup: it exercises
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

  test("a 'blocks' proposal applies to the open Visual Builder page, tags the block, and Undo removes it", async ({ page }) => {
    // Mocks the Builder's own data calls too (list + get on api::landing.landing)
    // so this stays a pure client-state test like the rest of the suite —
    // no real Strapi content needed, just a page that opens with zero blocks
    // so the proposal's own insert is the only thing that adds one.
    //
    // The canvas itself is components/blockPreview/RealPreview.tsx's
    // same-origin srcDoc iframe (the real primary editing surface for a
    // gov-portal-dialect tenant, which is what the scheduler session below
    // resolves to) — Playwright doesn't pierce iframes by default, so every
    // canvas-side assertion goes through a frameLocator instead of `page`.
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "draft", model: "" } }));
    await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/cms/entries/api%3A%3Alanding.landing?**", (route) => route.fulfill({
      json: { data: [{ documentId: "mockpage1", title: "Mock Landing" }], total: 1, pageCount: 1 },
    }));
    await page.route("**/api/cms/entries/api%3A%3Alanding.landing/mockpage1**", (route) => route.fulfill({
      json: { blocks: [] },
    }));
    await page.route("**/api/agent/run", (route) => route.fulfill({
      status: 200, contentType: "text/event-stream",
      body: sse([
        { type: "run_started", runId: "r3", threadId: "t3", level: "draft", model: "" },
        { type: "tool_call", id: "c1", name: "insert_blocks", args: {} },
        { type: "tool_result", id: "c1", ok: true, summary: "Proposed 1 block(s)" },
        {
          type: "proposal", proposal: {
            id: "p3", kind: "blocks", target: { uid: "api::landing.landing", id: "mockpage1" },
            title: "Block changes",
            blocks: [{ __component: "block.hero", heading: "Agent Heading", subheading: "x", ctaLabel: "Go" }],
            at: 0,
          },
        },
        { type: "done", runId: "r3" },
      ]),
    }));

    // Wide viewport: with the agent panel open, .vb2 stacks the canvas
    // below the block-list aside under ~1180px of remaining width (see
    // Shell.tsx/globals.css's .ag-open rules) — the default 1280x720
    // viewport plus a 400px docked panel leaves the canvas scrolled out of
    // the initial layout rather than side-by-side with it.
    await page.setViewportSize({ width: 1800, height: 1000 });
    await page.goto(WEBX_STUDIO + "/builder");
    const canvas = page.frameLocator('iframe[title="Real preview"]');
    await expect(canvas.locator(".pvb-agent-draft")).toHaveCount(0, { timeout: 15_000 }); // mock page loaded, zero blocks

    await page.getByTestId("agent-toggle").click();
    await page.getByTestId("agent-composer").fill("Add a hero block");
    await page.getByTestId("agent-send").click();

    await expect(page.getByText("Block changes")).toBeVisible({ timeout: 10_000 });
    const applyBtn = page.getByRole("button", { name: "Apply" });
    await expect(applyBtn).toBeEnabled({ timeout: 10_000 }); // targetMatches: same uid+docId as the open page
    await applyBtn.click();

    await expect(canvas.locator(".pvb-agent-draft")).toHaveCount(1, { timeout: 10_000 });
    await expect(canvas.locator(".home-hero")).toBeVisible(); // the actual inserted block, not just the tag

    // Exact match: the Builder's own global Ctrl+Z undo button is ALSO
    // named "Undo" (as "Undo (Ctrl+Z)"), disabled and unrelated to this
    // proposal's own dedicated undo — see applyAgentProposal's own comment
    // on why they're deliberately two different mechanisms.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(canvas.locator(".pvb-agent-draft")).toHaveCount(0);
    await expect(canvas.locator(".home-hero")).toHaveCount(0);
  });

  test("a resumable stop offers Continue, which resumes the same thread without a new message", async ({ page }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "draft", model: "" } }));
    await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));
    const bodies: any[] = [];
    await page.route("**/api/agent/run", (route) => {
      bodies.push(route.request().postDataJSON());
      const events = bodies.length === 1
        ? [
            { type: "run_started", runId: "r9", threadId: "t9", level: "draft", model: "" },
            { type: "tool_call", id: "c1", name: "search_content", args: {} },
            { type: "tool_result", id: "c1", ok: true, summary: "Found 4 entries" },
            { type: "stopped", reason: "slice_end", resumable: true, message: "Paused — reached this run's step limit (1 of 1 steps succeeded). Continue to pick up where it left off." },
            { type: "done", runId: "r9" },
          ]
        : [
            { type: "run_started", runId: "r10", threadId: "t9", level: "draft", model: "" },
            { type: "text", content: "Finished the remaining steps." },
            { type: "done", runId: "r10" },
          ];
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(events) });
    });

    await page.goto(WEBX_STUDIO + "/dashboard");
    await page.getByTestId("agent-toggle").click();
    await page.getByTestId("agent-composer").fill("Audit every news entry");
    await page.getByTestId("agent-send").click();

    await expect(page.getByTestId("agent-stopped")).toContainText("step limit", { timeout: 10_000 });
    await page.getByTestId("agent-continue").click();

    await expect(page.getByText("Finished the remaining steps.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("agent-continue")).toHaveCount(0); // the old notice can't be continued twice
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({ resume: true, threadId: "t9" });
    expect(bodies[1].message).toBeUndefined();
  });

  test("a plan renders as a checklist that updates in place, and a question's option button answers it", async ({ page }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "draft", model: "" } }));
    await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));
    const bodies: any[] = [];
    await page.route("**/api/agent/run", (route) => {
      bodies.push(route.request().postDataJSON());
      const events = bodies.length === 1
        ? [
            { type: "run_started", runId: "r11", threadId: "t11", level: "draft", model: "" },
            { type: "plan", items: [{ id: "1", title: "Create the news draft", status: "pending" }, { id: "2", title: "Create the FAQ draft", status: "pending" }] },
            { type: "tool_call", id: "c1", name: "create_draft_entry", args: {} },
            { type: "tool_result", id: "c1", ok: true, summary: "Created a draft api::news.news" },
            { type: "plan_item", id: "1", status: "done", result: "doc-1" },
            { type: "question", question: "Which category should the FAQ use?", options: ["General", "Services"] },
            { type: "done", runId: "r11" },
          ]
        : [
            { type: "run_started", runId: "r12", threadId: "t11", level: "draft", model: "" },
            { type: "plan_item", id: "2", status: "done", result: "doc-2" },
            { type: "verification", ok: true, report: "2 of 2 plan items done." },
            { type: "text", content: "Both drafts are ready." },
            { type: "done", runId: "r12" },
          ];
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(events) });
    });

    await page.goto(WEBX_STUDIO + "/dashboard");
    await page.getByTestId("agent-toggle").click();
    await page.getByTestId("agent-composer").fill("Create a news draft and an FAQ draft");
    await page.getByTestId("agent-send").click();

    const plan = page.getByTestId("agent-plan");
    await expect(plan).toContainText("Create the news draft", { timeout: 10_000 });
    await expect(plan.locator('[data-status="done"]')).toHaveCount(1);
    await expect(plan).toContainText("1/2");
    await expect(plan).toContainText("doc-1");
    await expect(page.getByTestId("agent-question")).toContainText("Which category should the FAQ use?");

    await page.getByRole("button", { name: "Services", exact: true }).click();

    await expect(page.getByText("Both drafts are ready.")).toBeVisible({ timeout: 10_000 });
    await expect(plan.locator('[data-status="done"]')).toHaveCount(2);
    await expect(plan).toContainText("2/2");
    await expect(page.getByTestId("agent-plan")).toHaveCount(1); // updated in place, not duplicated
    await expect(page.getByRole("button", { name: "Services", exact: true })).toBeDisabled();
    expect(bodies[1]).toMatchObject({ message: "Services", threadId: "t11" });
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

  // ---- Background jobs (Phase 9 M5) ----

  test("Jobs tab: a template previews what it will do, starts a job, and opens the job's page", async ({ page }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "draft", model: "", background: true } }));
    await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/cms/roles/content-types**", (route) => route.fulfill({
      json: [{ uid: "api::news.news", label: "News" }, { uid: "api::faq.faq", label: "FAQ" }],
    }));
    await page.route("**/api/agent/jobs/summary", (route) => route.fulfill({ json: { active: 1, waiting: 0, failed: 0 } }));
    const posted: { path: string; body: any }[] = [];
    await page.route("**/api/agent/jobs/preview", (route) => {
      posted.push({ path: "preview", body: route.request().postDataJSON() });
      return route.fulfill({
        json: {
          template: "bulk_create", title: "Create 2 drafts across 2 content types", requiredLevel: "draft", count: 2,
          items: [{ title: "News draft" }, { title: "FAQ draft" }], estimatedTokens: 12000, tokenBudget: 500000,
        },
      });
    });
    await page.route("**/api/agent/jobs", (route) => {
      if (route.request().method() !== "POST") return route.fulfill({ json: [] });
      posted.push({ path: "create", body: route.request().postDataJSON() });
      return route.fulfill({ json: { documentId: "job1", title: "Create 2 drafts across 2 content types", runState: "queued" } });
    });
    const plan = [
      { id: "news-1", title: "News draft", detail: "api::news.news", status: "done", result: "doc-n1" },
      { id: "faq-1", title: "FAQ draft", detail: "api::faq.faq", status: "pending" },
    ];
    await page.route("**/api/agent/jobs/job1/events**", (route) => route.fulfill({
      json: {
        job: {
          documentId: "job1", title: "Create 2 drafts across 2 content types", template: "bulk_create", runState: "running",
          ownerEmail: "editor@dga.local", tokensUsed: 5400, budget: { maxTokens: 500000 },
          progress: { turns: 2, toolCalls: 1, tokens: 5400, applied: 1, proposals: 0, plan, question: null },
        },
        events: [
          { seq: 1, at: "2026-09-11T03:00:00.000Z", type: "plan", items: plan },
          { seq: 2, at: "2026-09-11T03:00:05.000Z", type: "tool_call", id: "w1", name: "create_draft_entry", args: {} },
          { seq: 3, at: "2026-09-11T03:00:06.000Z", type: "tool_result", id: "w1", ok: true, summary: "Created a draft api::news.news" },
        ],
      },
    }));

    await page.goto(WEBX_STUDIO + "/agent/jobs");
    await expect(page.getByTestId("agent-jobs")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No background jobs yet.")).toBeVisible();

    await page.getByTestId("agent-job-tpl-bulk_create").click();
    const form = page.getByTestId("agent-job-form");
    const start = page.getByTestId("agent-job-start");
    await expect(start).toBeDisabled();
    await form.getByRole("button", { name: "News", exact: true }).click();
    await form.getByRole("button", { name: "FAQ", exact: true }).click();
    await expect(start).toBeDisabled(); // a bulk job has to be previewed first
    await page.getByTestId("agent-job-preview-btn").click();

    const preview = page.getByTestId("agent-job-preview");
    await expect(preview).toContainText("Creates 2 drafts", { timeout: 10_000 });
    await expect(preview).toContainText("FAQ draft");
    await expect(start).toBeEnabled();
    await start.click();

    await expect(page).toHaveURL(/\/agent\/jobs\/job1$/, { timeout: 10_000 });
    const checklist = page.getByTestId("agent-job-plan");
    await expect(checklist).toContainText("1/2", { timeout: 10_000 });
    await expect(checklist.locator('[data-status="done"]')).toHaveCount(1);
    await expect(page.getByTestId("agent-job-timeline")).toContainText("create_draft_entry");
    await expect(page.getByTestId("agent-job-state")).toHaveAttribute("data-state", "running");
    await expect(page.getByTestId("agent-jobs-indicator")).toContainText("1");
    expect(posted.map((p) => p.path)).toEqual(["preview", "create"]);
    expect(posted[1].body).toMatchObject({ template: "bulk_create", params: { contentTypes: ["api::news.news", "api::faq.faq"], perType: 1 } });
  });

  test("a job waiting for an answer shows its question in Thai, and answering sends it to the job", async ({ page }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "draft", model: "", background: true } }));
    await page.route("**/api/agent/jobs/summary", (route) => route.fulfill({ json: { active: 0, waiting: 1, failed: 0 } }));
    let answered: any = null;
    await page.route("**/api/agent/jobs/job2/answer", (route) => {
      answered = route.request().postDataJSON();
      return route.fulfill({ json: { documentId: "job2", runState: "queued" } });
    });
    const base = { documentId: "job2", title: "Tidy the FAQs", template: "custom", ownerEmail: "editor@dga.local", tokensUsed: 900 };
    await page.route("**/api/agent/jobs/job2/events**", (route) => route.fulfill({
      json: {
        events: [],
        job: answered
          ? { ...base, runState: "queued" }
          : {
              ...base, runState: "paused", stateReason: "needs_input",
              progress: { turns: 1, toolCalls: 0, tokens: 900, applied: 0, proposals: 0, plan: null, question: { question: "Merge duplicate FAQs?", options: ["Yes", "No"] } },
            },
      },
    }));

    await page.goto(WEBX_STUDIO + "/agent/jobs/job2");
    await page.getByRole("button", { name: "ไทย" }).click();
    await expect(page.getByTestId("agent-job-state")).toHaveText("รอคำตอบ", { timeout: 15_000 });
    await expect(page.getByTestId("agent-job-question")).toContainText("Merge duplicate FAQs?");
    await expect(page.getByTestId("agent-jobs-indicator")).toHaveAttribute("title", "มีงานเบื้องหลังรอคำตอบจากคุณ");

    await page.getByTestId("agent-job-question").getByRole("button", { name: "Yes", exact: true }).click();
    await expect(page.getByTestId("agent-job-state")).toHaveAttribute("data-state", "queued", { timeout: 10_000 });
    await expect(page.getByTestId("agent-job-question")).toHaveCount(0);
    expect(answered).toEqual({ answer: "Yes" });
  });

  test("with background jobs turned off, the Jobs tab says so and offers no templates", async ({ page }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "draft", model: "", background: false } }));
    await page.route("**/api/agent/jobs", (route) => route.fulfill({ json: [] }));

    await page.goto(WEBX_STUDIO + "/agent/jobs");
    await expect(page.getByTestId("agent-jobs-off")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("agent-job-tpl-bulk_create")).toHaveCount(0);
    await expect(page.getByTestId("agent-jobs-indicator")).toHaveCount(0);
  });

  test("a resumable stop offers Continue in background, which turns the conversation into a job", async ({ page }) => {
    await page.route("**/api/agent/status", (route) => route.fulfill({ json: { level: "draft", model: "", background: true } }));
    await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/agent/jobs/summary", (route) => route.fulfill({ json: { active: 1, waiting: 0, failed: 0 } }));
    await page.route("**/api/agent/run", (route) => route.fulfill({
      status: 200, contentType: "text/event-stream",
      body: sse([
        { type: "run_started", runId: "r20", threadId: "t20", level: "draft", model: "" },
        { type: "stopped", reason: "slice_end", resumable: true, message: "Paused — reached this run's step limit." },
        { type: "done", runId: "r20" },
      ]),
    }));
    let fromThread: any = null;
    await page.route("**/api/agent/jobs/from-thread", (route) => {
      fromThread = route.request().postDataJSON();
      return route.fulfill({ json: { documentId: "job3", runState: "queued" } });
    });
    await page.route("**/api/agent/jobs/job3/events**", (route) => route.fulfill({
      json: { events: [], job: { documentId: "job3", title: "Audit every news entry", template: "custom", runState: "queued", ownerEmail: "editor@dga.local", tokensUsed: 0 } },
    }));

    await page.goto(WEBX_STUDIO + "/dashboard");
    await page.getByTestId("agent-toggle").click();
    await page.getByTestId("agent-composer").fill("Audit every news entry");
    await page.getByTestId("agent-send").click();
    await page.getByTestId("agent-continue-bg").click();

    await expect(page).toHaveURL(/\/agent\/jobs\/job3$/, { timeout: 10_000 });
    await expect(page.getByTestId("agent-job-detail")).toContainText("Audit every news entry");
    expect(fromThread).toMatchObject({ threadId: "t20" });
  });
});
