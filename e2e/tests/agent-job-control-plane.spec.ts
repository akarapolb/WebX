import { test, expect, type APIRequestContext } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import {
  WEBX_STUDIO, STRAPI_URL, studioContext,
  STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD,
  DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD, MOCK_LITELLM_PORT,
} from "./_helpers";

// Track C5 (docs/target-architecture.md): with WEBX_CONTROL_QUEUE=1 (and the control URL and token) on webx-studio, a background
// job is created, leased by a worker, run and finished through webx-control's queue. queue-control-plane.spec.ts covers the list,
// read and cancel of jobs put in the queue directly; this runs one job all the way: an editor starts a job through Studio's
// jobs API, Studio's own worker leases it from the control plane, plays it against a mock model (webx-studio/tests/scenarios/
// write-draft-field.scenario.json: one tool call that writes a draft field, then the end), and the job ends `done` in the control
// plane with the write really made and attributed to the agent. Studio must be started with LITELLM_URL pointing at the mock.
const CONTROL = (process.env.AUDIT_CONTROL_URL || "").replace(/\/$/, "");
const TOKEN = process.env.AUDIT_CONTROL_TOKEN || "";
const TARGET_UID = "api::article.article";
const TARGET_FIELD = "title";

async function strapiLogin(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${STRAPI_URL}/admin/login`, { data: { email: STRAPI_SCHEDULER_EMAIL, password: STRAPI_SCHEDULER_PASSWORD } });
  expect(r.ok(), "scheduler login must succeed").toBeTruthy();
  return (await r.json()).data.token as string;
}

test.describe("A background job run through the control plane's queue", () => {
  test.skip(
    !CONTROL || !TOKEN || !DGA_EDITOR_PASSWORD || !STRAPI_SCHEDULER_PASSWORD,
    "AUDIT_CONTROL_URL, AUDIT_CONTROL_TOKEN, DGA_EDITOR_PASSWORD and STRAPI_SCHEDULER_PASSWORD required (and Studio started with LITELLM_URL at the mock model's port)"
  );
  test.setTimeout(180_000);

  let mockProc: ChildProcess | null = null;
  let schedulerToken = "";
  let tenantDocumentId = "";
  let originalPlan = "";
  let entryDocumentId = "";
  let originalTitle = "";
  const newTitle = "Queue job e2e title " + Date.now();
  const control = (p: string) => fetch(`${CONTROL}/internal/jobs${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } });

  test.beforeAll(async ({ request }) => {
    schedulerToken = await strapiLogin(request);
    const auth = { Authorization: "Bearer " + schedulerToken };
    const tenantRows = (await (await request.get(`${STRAPI_URL}/content-manager/collection-types/api::tenant.tenant?pageSize=200`, { headers: auth })).json()).results ?? [];
    const dga = tenantRows.find((t: any) => t.key === "dga");
    expect(dga, "seeded dga tenant must exist").toBeTruthy();
    tenantDocumentId = dga.documentId;
    originalPlan = dga.plan;
    const articleRows = (await (await request.get(`${STRAPI_URL}/content-manager/collection-types/${TARGET_UID}?pageSize=1&filters[tenant][key][$eq]=dga`, { headers: auth })).json()).results ?? [];
    expect(articleRows[0], "dga must have at least one seeded article to target").toBeTruthy();
    entryDocumentId = articleRows[0].documentId;
    originalTitle = articleRows[0].title;
    // the agent needs a plan that has it, a level that may write drafts (dga is on "free" and "off" in the dev seed), and
    // background jobs switched on for the workspace
    const set = await request.put(`${STRAPI_URL}/content-manager/collection-types/api::tenant.tenant/${tenantDocumentId}`, {
      headers: { ...auth, "Content-Type": "application/json" },
      data: { plan: "pro", features: { agent: { level: "draft", local: false, background: true } } },
    });
    expect(set.ok(), `turning the agent on for dga answered ${set.status()}`).toBeTruthy();

    mockProc = spawn(process.execPath, ["--import", "tsx", "tests/harness/mockLlmServer.ts"], {
      cwd: path.join(__dirname, "..", "..", "webx-studio"),
      env: {
        ...process.env,
        MOCK_LITELLM_PORT: String(MOCK_LITELLM_PORT),
        MOCK_SCENARIO: "write-draft-field",
        MOCK_VARS: JSON.stringify({ uid: TARGET_UID, id: entryDocumentId, field: TARGET_FIELD, value: newTitle }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`The mock LLM server didn't report ready on :${MOCK_LITELLM_PORT} within 20s`)), 20_000);
      mockProc!.stdout?.on("data", (chunk) => { if (String(chunk).includes("listening")) { clearTimeout(timer); resolve(); } });
      mockProc!.on("error", (e) => { clearTimeout(timer); reject(e); });
      mockProc!.on("exit", (code) => { if (code !== 0 && code !== null) { clearTimeout(timer); reject(new Error(`The mock LLM server exited early with code ${code}`)); } });
    });
  });

  test.afterAll(async ({ request }) => {
    mockProc?.kill();
    if (!schedulerToken) return;
    const auth = { Authorization: "Bearer " + schedulerToken, "Content-Type": "application/json" };
    if (tenantDocumentId) {
      await request.put(`${STRAPI_URL}/content-manager/collection-types/api::tenant.tenant/${tenantDocumentId}`, { headers: auth, data: { plan: originalPlan || "free", features: { agent: { level: "off", local: false } } } }).catch(() => {});
    }
    if (entryDocumentId && originalTitle) {
      await request.put(`${STRAPI_URL}/content-manager/collection-types/${TARGET_UID}/${entryDocumentId}`, { headers: auth, data: { title: originalTitle } }).catch(() => {});
    }
  });

  test("a job an editor starts is leased, run and finished through the queue, and its write is the agent's", async ({ browser }) => {
    const editor = await studioContext(browser, DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD);
    try {
      // Studio keeps each workspace's settings for up to 30 s, so the change made in beforeAll can take that long to be seen:
      // ask again while the answer is "turned off"
      let status = 0, text = "";
      for (let tries = 0; tries < 20; tries++) {
        const made = await editor.request.post(`${WEBX_STUDIO}/api/agent/jobs`, {
          data: { title: "Queue job e2e", goal: `Set the title of ${TARGET_UID} ${entryDocumentId} to "${newTitle}".`, template: "custom", lang: "en" },
          timeout: 90_000,
        });
        status = made.status();
        text = await made.text();
        if (made.ok() || !/turned off|not available in this workspace|paid plan/.test(text)) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      expect(status >= 200 && status < 300, `creating the job answered ${status}: ${text}`).toBeTruthy();
      const job = JSON.parse(text);
      const id = (job.data ?? job).documentId as string;
      expect(id, "the job has an id").toBeTruthy();

      const inQueue = (await (await control("/" + id)).json()).data;
      expect(inQueue, "the job is in the control plane's queue, not Strapi's").toBeTruthy();
      expect([inQueue.tenantKey, inQueue.ownerEmail]).toEqual(["dga", DGA_EDITOR_EMAIL]);

      // Studio's worker leases it from the control plane and runs it against the mock model
      let state = "";
      for (let waited = 0; waited < 120_000 && !["done", "failed", "cancelled", "stuck_crash"].includes(state); waited += 1500) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await editor.request.get(`${WEBX_STUDIO}/api/agent/jobs/${id}`);
        const j = r.ok() ? await r.json() : null;
        state = String((j?.data ?? j)?.runState ?? "");
      }
      const final = (await (await control("/" + id)).json()).data;
      // what the mock model saw and refused, for when the job does not finish
      const seen = await fetch(`http://localhost:${MOCK_LITELLM_PORT}/__mock/report`).then((r) => r.json()).catch((e) => ({ unreachable: String(e) }));
      const why = JSON.stringify({
        runState: final.runState, error: final.error, attempts: final.attempts, events: (final.events || []).slice(0, 24),
        mock: { requests: seen.requests, remaining: seen.remaining, violations: seen.violations, failures: seen.failures, unreachable: seen.unreachable },
      });
      expect(state, `the job ended ${state}; in the queue: ${why}`).toBe("done");
      expect(final.runState).toBe("done");
      expect(final.leaseToken || null, "a finished job holds no lease").toBeNull();

      // the write really landed, and is the agent's in the audit log
      const auth = { Authorization: "Bearer " + schedulerToken };
      const entry = await (await editor.request.get(`${STRAPI_URL}/content-manager/collection-types/${TARGET_UID}/${entryDocumentId}`, { headers: auth })).json();
      expect(entry.data?.title ?? entry.title).toBe(newTitle);
      const audit = (await (await fetch(`${CONTROL}/internal/audit?filter=${encodeURIComponent("entryId:eq:" + entryDocumentId)}&sort=at:desc&pageSize=10`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).data as any[];
      expect(audit.some((r) => r.action === "agent_update" && r.actor === "agent"), `an agent_update row for the entry: ${JSON.stringify(audit.slice(0, 3))}`).toBeTruthy();

      // the model saw a well-formed conversation and played out as scripted
      const report = await (await fetch(`http://localhost:${MOCK_LITELLM_PORT}/__mock/report`)).json();
      expect(report.violations, JSON.stringify(report.violations)).toEqual([]);
      expect(report.failures, JSON.stringify(report.failures)).toEqual([]);
      expect(report.remaining).toBe(0);
    } finally {
      await editor.close();
    }
  });
});
