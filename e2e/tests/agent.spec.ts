import { test, expect, type APIRequestContext } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import {
  WEBX_STUDIO, STRAPI_URL,
  STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD,
  DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD, MOCK_LITELLM_PORT,
} from "./_helpers";

// __dirname (CJS global — this repo's e2e package has no "type":"module",
// and Playwright's own TS transform here doesn't support import.meta) —
// used below to spawn mock-litellm.mjs by an absolute path regardless of
// the shell's own cwd when `npx playwright test` is invoked.
const TARGET_UID = "api::article.article";
const TARGET_FIELD = "title";

// Real Strapi admin API calls (bearer token, not the browser session) —
// same "verify against the backend directly" discipline studio-roundtrip
// and user-management already use, needed here for the tenant plan/policy
// setup this test has to do (and undo) around the actual agent run.
async function strapiLogin(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${STRAPI_URL}/admin/login`, { data: { email: STRAPI_SCHEDULER_EMAIL, password: STRAPI_SCHEDULER_PASSWORD } });
  expect(r.ok(), "scheduler login must succeed").toBeTruthy();
  const j = await r.json();
  return j.data.token as string;
}

test.describe("WebX Agent — real backend run against a mock LLM", () => {
  test.skip(!STRAPI_SCHEDULER_PASSWORD, "STRAPI_SCHEDULER_PASSWORD not set — see e2e/README.md");
  test.skip(!DGA_EDITOR_PASSWORD, "DGA_EDITOR_PASSWORD not set — see e2e/README.md");

  let mockProc: ChildProcess | null = null;
  let sessionState: any;
  let schedulerToken = "";
  let tenantDocumentId = "";
  let originalPlan = "";
  let entryDocumentId = "";
  let originalTitle = "";
  const newTitle = "Agent e2e test title " + Date.now();

  test.beforeAll(async ({ request, browser }) => {
    schedulerToken = await strapiLogin(request);
    const auth = { Authorization: "Bearer " + schedulerToken };

    // Find dga's own tenant row (need its documentId to flip plan/policy)
    // and one of dga's own articles (need its documentId + current title to
    // target and restore).
    const tenantsRes = await request.get(`${STRAPI_URL}/content-manager/collection-types/api::tenant.tenant?pageSize=200`, { headers: auth });
    const tenantRows = (await tenantsRes.json()).results ?? [];
    const dga = tenantRows.find((t: any) => t.key === "dga");
    expect(dga, "seeded dga tenant must exist").toBeTruthy();
    tenantDocumentId = dga.documentId;
    originalPlan = dga.plan;

    // filters[tenant][key][$eq]=dga — same bracket-path filter shape
    // lib/cms/strapi.ts's buildQuery generates server-side for any relation
    // field, used explicitly here rather than guessing whether the list
    // response's own "tenant" relation comes back populated (id-only vs. a
    // full {id,key,...} object isn't guaranteed by this endpoint).
    const articlesRes = await request.get(
      `${STRAPI_URL}/content-manager/collection-types/${TARGET_UID}?pageSize=1&filters[tenant][key][$eq]=dga`, { headers: auth }
    );
    const articleRows = (await articlesRes.json()).results ?? [];
    const dgaArticle = articleRows[0];
    expect(dgaArticle, "dga must have at least one seeded article to target").toBeTruthy();
    entryDocumentId = dgaArticle.documentId;
    originalTitle = dgaArticle.title;

    // Grant the agent a real "draft" level + bump the plan (dga is
    // deliberately left on "free" in this dev seed — see the governance.ts
    // GENERIC_ROUTE_READ_BLOCKED_UIDS comment's cross-reference — which
    // would otherwise force resolveAgentPolicy to "off" regardless of the
    // level set below).
    await request.put(`${STRAPI_URL}/content-manager/collection-types/api::tenant.tenant/${tenantDocumentId}`, {
      headers: { ...auth, "Content-Type": "application/json" },
      data: { plan: "pro", features: { agent: { level: "draft", local: false } } },
    });

    // The mock LLM: turn 1 always calls write_draft_fields against this
    // exact entry, turn 2 always ends the run — see mock-litellm.mjs.
    // stdio "pipe" (not "ignore") + listening for its own startup line is
    // deliberate — found live: a STALE mock-litellm process left over from
    // an earlier manual/interrupted run silently kept :4010 bound, so this
    // run's own freshly-spawned process failed to bind and its EADDRINUSE
    // never surfaced (spawn()'s bind failure is async and stdio:"ignore"
    // swallows it) — the test proceeded straight into the OLD process's
    // stale target and failed on an unrelated-looking "update failed" a
    // full turn later, nowhere near this actual root cause. Failing fast
    // and loudly here instead of an hour later downstream.
    mockProc = spawn("node", ["mock-litellm.mjs"], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        MOCK_LITELLM_PORT: String(MOCK_LITELLM_PORT),
        MOCK_TARGET_UID: TARGET_UID, MOCK_TARGET_ID: entryDocumentId,
        MOCK_TARGET_FIELD: TARGET_FIELD, MOCK_TARGET_VALUE: newTitle,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`mock-litellm.mjs didn't report ready on :${MOCK_LITELLM_PORT} within 5s — is something else already bound to that port?`)), 5000);
      mockProc!.stdout?.on("data", (chunk) => { if (String(chunk).includes("listening")) { clearTimeout(timer); resolve(); } });
      mockProc!.on("error", (e) => { clearTimeout(timer); reject(e); });
      mockProc!.on("exit", (code) => { if (code !== 0 && code !== null) { clearTimeout(timer); reject(new Error(`mock-litellm.mjs exited early with code ${code} — port ${MOCK_LITELLM_PORT} likely already in use`)); } });
    });

    // A real tenant-scoped session — resolveAgentPolicy structurally
    // refuses an unscoped one (see _helpers.ts's own comment on this).
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(WEBX_STUDIO + "/login");
    await page.getByRole("tab", { name: "Strapi" }).click();
    await page.getByPlaceholder("admin@webx.io").fill(DGA_EDITOR_EMAIL);
    await page.getByPlaceholder("••••••••").fill(DGA_EDITOR_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    sessionState = await context.storageState();
    await context.close();
  });

  test.afterAll(async ({ request }) => {
    mockProc?.kill();
    if (!schedulerToken) return;
    const auth = { Authorization: "Bearer " + schedulerToken, "Content-Type": "application/json" };
    // Restore plan/policy and the entry's title regardless of pass/fail, so
    // a failed assertion never leaves dga permanently drifted from its real
    // seeded state (same idempotent-restore discipline as studio-roundtrip).
    if (tenantDocumentId) {
      await request.put(`${STRAPI_URL}/content-manager/collection-types/api::tenant.tenant/${tenantDocumentId}`, {
        headers: auth, data: { plan: originalPlan || "free", features: { agent: { level: "off", local: false } } },
      }).catch(() => {});
    }
    if (entryDocumentId && originalTitle) {
      await request.put(`${STRAPI_URL}/content-manager/collection-types/${TARGET_UID}/${entryDocumentId}`, {
        headers: auth, data: { title: originalTitle },
      }).catch(() => {});
    }
  });

  test.beforeEach(async ({ context }) => { await context.addCookies(sessionState.cookies); });

  test("agent writes a real draft field via a scripted tool call, attributed to actor:agent in the audit log", async ({ page }) => {
    // Drives POST /api/agent/run directly (not through the composer UI) —
    // this suite is about the backend contract (SSE shape, the tool
    // actually writing, audit attribution), which agent-panel.spec.ts's
    // mocked-SSE suite doesn't exercise at all.
    const res = await page.request.post(`${WEBX_STUDIO}/api/agent/run`, {
      data: {
        message: `Set the title of ${TARGET_UID} ${entryDocumentId} to "${newTitle}".`,
        mode: "docked", lang: "en",
        context: { kind: "entry", uid: TARGET_UID, docId: entryDocumentId, applyLocally: false },
      },
      timeout: 60_000,
    });
    expect(res.ok(), "the SSE endpoint itself must return 200, even though the body is a stream").toBeTruthy();
    const body = await res.text();

    // Assert on the raw SSE event stream: run_started, a tool_call naming
    // write_draft_fields, a tool_result that reports ok, and done.
    expect(body).toContain('"type":"run_started"');
    expect(body).toMatch(/"type":"tool_call".*"name":"write_draft_fields"/);
    const toolResultLine = body.split("\n\n").find((l) => l.includes('"type":"tool_result"'));
    expect(toolResultLine, "a tool_result event must be present").toBeTruthy();
    expect(toolResultLine).toMatch(/"ok":true/);
    expect(body).toContain('"type":"done"');

    // Verify the write actually landed — not just that the stream claimed
    // it did — via a direct Strapi read.
    const auth = { Authorization: "Bearer " + schedulerToken };
    const entryRes = await page.request.get(`${STRAPI_URL}/content-manager/collection-types/${TARGET_UID}/${entryDocumentId}`, { headers: auth });
    const entry = await entryRes.json();
    expect(entry.data?.title ?? entry.title).toBe(newTitle);

    // Verify audit attribution: writeAudit's actor-store wrapping
    // (governance.ts's withAgentActor, threaded from runtime.ts around
    // every tool call) must have produced a real "agent_update" row with
    // actor:"agent" and targetRef set to this run's id, not just an
    // ordinary "update" row as if a human had typed the change.
    const auditRes = await page.request.get(
      `${STRAPI_URL}/content-manager/collection-types/api::audit-log.audit-log?pageSize=5&sort=createdAt:desc`,
      { headers: auth }
    );
    const auditRows = (await auditRes.json()).results ?? [];
    const agentRow = auditRows.find((r: any) => r.action === "agent_update" && r.entryId === entryDocumentId && r.actor === "agent");
    expect(agentRow, `an audit-log row {action:"agent_update", actor:"agent", entryId:"${entryDocumentId}"} must exist — got: ${JSON.stringify(auditRows.slice(0, 3))}`).toBeTruthy();
  });
});
