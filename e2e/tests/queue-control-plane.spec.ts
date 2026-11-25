import { test, expect, type BrowserContext } from "@playwright/test";
import {
  WEBX_STUDIO, STRAPI_SCHEDULER_PASSWORD, studioContext,
  DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD,
  PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD,
} from "./_helpers";

// Track C5 (docs/target-architecture.md): with WEBX_CONTROL_QUEUE=1 (and the control
// URL and token) on webx-studio, background jobs live in webx-control's queue. A job
// is put in the queue directly (as a worker or a creating request would), and real
// tenant editors then use Studio's own API on it:
//   - the jobs list shows an editor their workspace's jobs and no other workspace's;
//   - a job is read by id only inside its workspace;
//   - a cancel from the owning workspace reaches the queue (a queued job is cancelled),
//     and another workspace's cancel does not.
// Same stack as audit-control-plane.spec.ts: AUDIT_CONTROL_URL / AUDIT_CONTROL_TOKEN.
const CONTROL = (process.env.AUDIT_CONTROL_URL || "").replace(/\/$/, "");
const TOKEN = process.env.AUDIT_CONTROL_TOKEN || "";

test.describe("Background jobs in the control plane's queue", () => {
  test.skip(
    !CONTROL || !TOKEN || !DGA_EDITOR_PASSWORD || !PEA_EDITOR_PASSWORD || !STRAPI_SCHEDULER_PASSWORD,
    "AUDIT_CONTROL_URL, AUDIT_CONTROL_TOKEN, DGA_EDITOR_PASSWORD, PEA_EDITOR_PASSWORD and STRAPI_SCHEDULER_PASSWORD required"
  );

  const loginAs = studioContext;
  const control = (path: string, init: RequestInit = {}) =>
    fetch(`${CONTROL}/internal/jobs${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers || {}) } });
  const queue = async (tenantKey: string, ownerEmail: string, title: string) => {
    const r = await control("", { method: "POST", body: JSON.stringify({ data: { tenantKey, ownerEmail, ownerUserId: "1", engine: "strapi", title, goal: title, requiredLevel: "read", policySnapshot: { level: "read" } } }) });
    expect(r.ok, `queueing answered ${r.status}`).toBeTruthy();
    return ((await r.json()).data.documentId) as string;
  };

  const stamp = Date.now();
  let dga: BrowserContext;
  let pea: BrowserContext;
  let dgaJob = "";
  let peaJob = "";

  test.beforeAll(async ({ browser }) => {
    [dga, pea] = await Promise.all([
      loginAs(browser, DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD),
      loginAs(browser, PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD),
    ]);
    dgaJob = await queue("dga", DGA_EDITOR_EMAIL, "dga job " + stamp);
    peaJob = await queue("pea", PEA_EDITOR_EMAIL, "pea job " + stamp);
  });

  test.afterAll(async () => {
    for (const id of [dgaJob, peaJob]) if (id) await control("/control", { method: "POST", body: JSON.stringify({ documentId: id, action: "cancel" }) }).catch(() => {});
    await dga?.close();
    await pea?.close();
  });

  const titles = async (ctx: BrowserContext) => {
    const r = await ctx.request.get(`${WEBX_STUDIO}/api/agent/jobs`);
    expect(r.ok(), `the jobs list answered ${r.status()}`).toBeTruthy();
    const body = await r.json();
    return ((body.data ?? body) as any[]).map((j) => j.title as string);
  };

  test("the jobs list shows an editor their workspace's jobs and no other's", async () => {
    const mine = await titles(dga);
    expect(mine, "dga sees its own job").toContain("dga job " + stamp);
    expect(mine, "dga does not see pea's").not.toContain("pea job " + stamp);
    const theirs = await titles(pea);
    expect(theirs).toContain("pea job " + stamp);
    expect(theirs).not.toContain("dga job " + stamp);
  });

  test("a job is read by id inside its workspace only, without its lease or checkpoint", async () => {
    const own = await dga.request.get(`${WEBX_STUDIO}/api/agent/jobs/${dgaJob}`);
    expect(own.ok(), `own job answered ${own.status()}`).toBeTruthy();
    const view = await own.json();
    const job = view.data ?? view;
    expect(job.documentId).toBe(dgaJob);
    expect(job.leaseToken, "the lease token is never shown").toBeUndefined();
    const other = await pea.request.get(`${WEBX_STUDIO}/api/agent/jobs/${dgaJob}`);
    expect(other.status(), "another workspace must not read it").toBe(404);
  });

  test("a cancel from the owning workspace reaches the queue; another workspace's does not", async () => {
    const byPea = await pea.request.post(`${WEBX_STUDIO}/api/agent/jobs/${dgaJob}/cancel`, { data: {} });
    expect(byPea.ok(), "pea must not cancel dga's job").toBeFalsy();
    expect(((await (await control("/" + dgaJob)).json()).data).runState).toBe("queued");
    const own = await dga.request.post(`${WEBX_STUDIO}/api/agent/jobs/${dgaJob}/cancel`, { data: {} });
    expect(own.ok(), `own cancel answered ${own.status()}`).toBeTruthy();
    const after = (await (await control("/" + dgaJob)).json()).data;
    expect(after.runState).toBe("cancelled");
  });
});
