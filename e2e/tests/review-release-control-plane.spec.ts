import { test, expect, type BrowserContext } from "@playwright/test";
import {
  WEBX_STUDIO, STRAPI_URL, studioContext,
  STRAPI_SCHEDULER_EMAIL, STRAPI_SCHEDULER_PASSWORD,
  DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD,
  PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD,
} from "./_helpers";

// Track C3 (docs/target-architecture.md): with WEBX_CONTROL_URL and WEBX_CONTROL_SERVICE_TOKEN set on webx-studio, the review board's
// rows and the release calendar's live in webx-control, scoped by the workspace's key where Strapi's carry a `tenant` relation.
// This signs in as real editors of two workspaces and checks, through Studio's own API:
//   - a review and a release are stored in the control plane for the workspace that made them, and never reach Strapi;
//   - only that workspace can list, read, change or delete them, and a foreign update does not take a row over;
//   - an in-progress review holds back publishing its entry (the publish gate reads the control plane), for its own workspace only;
//   - the release scheduler reads due releases from the control plane, publishes their items as their workspace, writes the
//     result back, and refuses an item that is another workspace's.
// Needs the stack of audit-control-plane.spec.ts; the scheduler test also needs WEBX_SCHEDULER_SECRET here and on Studio.
const CONTROL = (process.env.AUDIT_CONTROL_URL || "").replace(/\/$/, "");
const TOKEN = process.env.AUDIT_CONTROL_TOKEN || "";
const SCHEDULER_SECRET = process.env.WEBX_SCHEDULER_SECRET || "";
const REVIEW = "api::review.review";
const RELEASE = "api::release.release";
const ARTICLE = "api::article.article";
const SERVICE = "api::service.service";

test.describe("Reviews and releases in the control plane", () => {
  test.skip(
    !CONTROL || !TOKEN || !DGA_EDITOR_PASSWORD || !PEA_EDITOR_PASSWORD || !STRAPI_SCHEDULER_PASSWORD,
    "AUDIT_CONTROL_URL, AUDIT_CONTROL_TOKEN, DGA_EDITOR_PASSWORD, PEA_EDITOR_PASSWORD and STRAPI_SCHEDULER_PASSWORD required"
  );
  // the tests build on each other (one review, one release)
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = Date.now();
  // an entry id no workspace has: the publish gate looks reviews up by it, and nothing else about the entry matters to it
  const ref = "e2e-gate-" + stamp;
  const created: { collection: string; id: string }[] = [];
  let dga: BrowserContext;
  let pea: BrowserContext;
  let strapiJwt = "";
  let reviewId = "";
  let releaseId = "";

  const ctl = (path: string, init: RequestInit = {}) => fetch(`${CONTROL}/internal${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) } });
  const ctlRow = async (collection: string, id: string) => {
    const r = await ctl(`/records/${collection}/${id}`);
    return r.ok ? ((await r.json()).data as any) : null;
  };
  const entries = (uid: string, id = "") => `${WEBX_STUDIO}/api/cms/entries/${uid}${id ? "/" + id : ""}`;
  const filterQs = (f: object[]) => "filter=" + encodeURIComponent(JSON.stringify(f));
  const strapiTotal = async (uid: string, field: string, value: string) => {
    const r = await fetch(`${STRAPI_URL}/content-manager/collection-types/${uid}?pageSize=1&filters[${field}][$eq]=${encodeURIComponent(value)}`, { headers: { Authorization: `Bearer ${strapiJwt}` } });
    expect(r.ok, `Strapi content-manager answered ${r.status}`).toBeTruthy();
    return ((await r.json()).pagination?.total ?? 0) as number;
  };
  const make = async (ctx: BrowserContext, collection: string, uid: string, data: object) => {
    const r = await ctx.request.post(entries(uid), { data });
    const text = await r.text();
    expect(r.ok(), `creating in ${collection} answered ${r.status()}: ${text}`).toBeTruthy();
    const id = JSON.parse(text).documentId as string;
    expect(id, "the new row has an id").toBeTruthy();
    created.push({ collection, id });
    return id;
  };

  test.beforeAll(async ({ browser }) => {
    const login = await fetch(`${STRAPI_URL}/admin/login`, {
      method: "POST", headers: { "content-type": "application/json", ...(process.env.STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": process.env.STRAPI_INTERNAL_SECRET } : {}) },
      body: JSON.stringify({ email: STRAPI_SCHEDULER_EMAIL, password: STRAPI_SCHEDULER_PASSWORD }),
    });
    strapiJwt = (await login.json())?.data?.token;
    expect(strapiJwt, "the scheduler account must be able to read Strapi").toBeTruthy();
    [dga, pea] = await Promise.all([
      studioContext(browser, DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD),
      studioContext(browser, PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD),
    ]);
  });

  test.afterAll(async () => {
    // leave nothing scheduled behind for a later run of the scheduler
    for (const { collection, id } of created) await ctl(`/records/${collection}/${id}`, { method: "DELETE" }).catch(() => {});
    await dga?.close();
    await pea?.close();
  });

  test("a review a dga editor files is kept in the control plane for dga, and Strapi never sees it", async () => {
    reviewId = await make(dga, "review", REVIEW, {
      documentRef: ref, contentType: ARTICLE, title: "E2E review " + stamp, stage: "in_review", requestedBy: DGA_EDITOR_EMAIL,
      history: [{ from: "draft", to: "in_review", by: DGA_EDITOR_EMAIL, at: new Date().toISOString() }],
    });
    const row = await ctlRow("review", reviewId);
    expect(row, "the review is in the control plane").toBeTruthy();
    expect([row.tenantKey, row.documentRef, row.contentType, row.stage]).toEqual(["dga", ref, ARTICLE, "in_review"]);
    expect(row.history[0].to, "its history is kept as it was sent").toBe("in_review");
    expect(row.tenant, "no tenant relation: the workspace is its key").toBeUndefined();
    expect(await strapiTotal(REVIEW, "documentRef", ref), "Strapi has no review of it").toBe(0);
    // the audit row of filing it is the workspace's own, and in the control plane too
    const audit = (await (await ctl(`/audit?filter=${encodeURIComponent("entryId:eq:" + reviewId)}`)).json()).data as any[];
    expect(audit.some((r) => r.action === "create" && r.contentType === REVIEW && r.tenantKey === "dga" && r.adminEmail === DGA_EDITOR_EMAIL), JSON.stringify(audit)).toBeTruthy();
  });

  test("only that workspace can list, read, change or delete it, and a foreign update does not take it over", async () => {
    const mine = await dga.request.get(entries(REVIEW) + "?" + filterQs([{ field: "documentRef", op: "eq", value: ref }]));
    expect(mine.ok(), "dga can list its reviews").toBeTruthy();
    expect(((await mine.json()).data as any[]).map((r) => r.documentId)).toEqual([reviewId]);
    const get = await dga.request.get(entries(REVIEW, reviewId));
    expect(get.ok(), "dga can read it by id").toBeTruthy();
    expect((await get.json()).stage).toBe("in_review");

    const theirs = await pea.request.get(entries(REVIEW) + "?" + filterQs([{ field: "documentRef", op: "eq", value: ref }]));
    expect(theirs.ok()).toBeTruthy();
    expect((await theirs.json()).data, "pea sees no dga review").toEqual([]);
    const sneaky = await pea.request.get(entries(REVIEW) + "?" + filterQs([{ field: "tenantKey", op: "eq", value: "dga" }]));
    expect(((await sneaky.json()).data as any[]).some((r) => r.documentId === reviewId), "naming dga's key in a filter does not get around the scoping").toBeFalsy();
    expect((await pea.request.get(entries(REVIEW, reviewId))).status(), "pea cannot read it by id").toBe(403);
    expect((await pea.request.put(entries(REVIEW, reviewId), { data: { stage: "approved", title: "taken over" } })).status(), "pea cannot change it").toBe(403);
    expect((await pea.request.delete(entries(REVIEW, reviewId))).status(), "pea cannot delete it").toBe(403);

    const row = await ctlRow("review", reviewId);
    expect([row.tenantKey, row.stage, row.title], "still dga's, unchanged").toEqual(["dga", "in_review", "E2E review " + stamp]);
  });

  test("the editor moves it through the stages and its history is kept", async () => {
    const before = await ctlRow("review", reviewId);
    const history = [...before.history, { from: "in_review", to: "changes", by: DGA_EDITOR_EMAIL, at: new Date().toISOString() }];
    const put = await dga.request.put(entries(REVIEW, reviewId), { data: { stage: "changes", history, note: "needs a source" } });
    expect(put.ok(), `updating the review answered ${put.status()}`).toBeTruthy();
    const row = await ctlRow("review", reviewId);
    expect([row.stage, row.note, row.history.length, row.tenantKey]).toEqual(["changes", "needs a source", 2, "dga"]);
    expect(row.documentRef, "a partial update keeps the other fields").toBe(ref);
  });

  test("an in-progress review holds back publishing its entry, for its own workspace only", async () => {
    const held = await dga.request.post(entries(ARTICLE, ref) + "/publish");
    expect(held.status(), "dga's publish is held back by its review").toBe(409);
    expect((await held.json()).error).toMatch(/in-progress review/);
    // pea has no review of that entry: dga's does not gate it (an entry id can repeat across workspaces)
    const other = await pea.request.post(entries(ARTICLE, ref) + "/publish");
    expect(other.status(), `pea's publish is not held back by dga's review (answered ${other.status()})`).not.toBe(409);
    // once approved it no longer holds the entry back (the entry itself does not exist, so the engine answers for that)
    const approve = await dga.request.put(entries(REVIEW, reviewId), { data: { stage: "approved" } });
    expect(approve.ok()).toBeTruthy();
    const after = await dga.request.post(entries(ARTICLE, ref) + "/publish");
    expect(after.status(), `an approved review does not hold the publish back (answered ${after.status()})`).not.toBe(409);
  });

  test("a release is kept in the control plane for the workspace that made it, out of other workspaces' reach", async () => {
    releaseId = await make(dga, "release", RELEASE, { name: "E2E release " + stamp, state: "draft", items: [{ contentType: ARTICLE, documentRef: ref, title: "First" }] });
    const row = await ctlRow("release", releaseId);
    expect([row.tenantKey, row.name, row.state, row.items.length]).toEqual(["dga", "E2E release " + stamp, "draft", 1]);
    expect(await strapiTotal(RELEASE, "name", "E2E release " + stamp), "Strapi has no such release").toBe(0);

    // the entry editor adds an item through an update of the whole list
    const more = [...row.items, { contentType: ARTICLE, documentRef: ref + "-2", title: "Second" }];
    const add = await dga.request.put(entries(RELEASE, releaseId), { data: { items: more } });
    expect(add.ok(), `adding an item answered ${add.status()}`).toBeTruthy();
    expect((await ctlRow("release", releaseId)).items.map((i: any) => i.documentRef)).toEqual([ref, ref + "-2"]);

    // the entry editor's list of releases that are not done yet
    const open = await dga.request.get(entries(RELEASE) + "?" + filterQs([{ field: "state", op: "ne", value: "done" }]));
    expect(open.ok()).toBeTruthy();
    expect(((await open.json()).data as any[]).some((r) => r.documentId === releaseId), "dga's open releases include it").toBeTruthy();

    const theirs = await pea.request.get(entries(RELEASE) + "?pageSize=100");
    expect(((await theirs.json()).data as any[]).some((r) => r.documentId === releaseId), "pea's list does not").toBeFalsy();
    expect((await pea.request.get(entries(RELEASE, releaseId))).status(), "pea cannot read it").toBe(403);
    expect((await pea.request.put(entries(RELEASE, releaseId), { data: { state: "done", items: [] } })).status(), "pea cannot change it").toBe(403);
    expect((await pea.request.delete(entries(RELEASE, releaseId))).status(), "pea cannot delete it").toBe(403);
    const kept = await ctlRow("release", releaseId);
    expect([kept.tenantKey, kept.state, kept.items.length], "still dga's and whole").toEqual(["dga", "draft", 2]);
  });

  test("the scheduler publishes a due release's items as its workspace, writes the result back, and refuses another workspace's item", async () => {
    test.skip(!SCHEDULER_SECRET, "WEBX_SCHEDULER_SECRET not set (here and on Studio)");
    // one service of each workspace: the last of the first few, so as not to meet the audit spec's changes to the first
    const pick = async (ctx: BrowserContext) => {
      const r = await ctx.request.get(entries(SERVICE) + "?pageSize=5");
      expect(r.ok(), "the workspace can read its services").toBeTruthy();
      const rows = (await r.json()).data as any[];
      expect(rows.length, "the workspace has a seeded service").toBeGreaterThan(0);
      return rows[Math.min(rows.length - 1, 2)];
    };
    const mine = await pick(dga);
    const theirs = await pick(pea);
    const due = new Date(Date.now() - 60_000).toISOString();
    const okId = await make(dga, "release", RELEASE, { name: "E2E due " + stamp, state: "scheduled", scheduledAt: due, items: [{ contentType: SERVICE, documentRef: mine.documentId, title: mine.title }] });
    const badId = await make(dga, "release", RELEASE, { name: "E2E foreign item " + stamp, state: "scheduled", scheduledAt: due, items: [{ contentType: SERVICE, documentRef: theirs.documentId, title: "not ours" }] });

    const tick = await fetch(`${WEBX_STUDIO}/api/internal/releases/process-due`, { method: "POST", headers: { "x-internal-secret": SCHEDULER_SECRET } });
    const body = await tick.text();
    // 502 when a release failed: that is how the tick tells its cron
    expect([200, 502], `the scheduler tick answered ${tick.status}: ${body}`).toContain(tick.status);
    const result = JSON.parse(body);
    expect(result.processed, body).toBeGreaterThanOrEqual(1);
    expect(result.failed, body).toBeGreaterThanOrEqual(1);

    const done = await ctlRow("release", okId);
    expect([done.state, Boolean(done.publishedAt), done.tenantKey], JSON.stringify(done)).toEqual(["done", true, "dga"]);
    const failed = await ctlRow("release", badId);
    expect(failed.state, JSON.stringify(failed)).toBe("failed");
    expect(failed.note, "the note says why").toMatch(/Cross-tenant/);

    const published = (await (await ctl(`/audit?filter=${encodeURIComponent("entryId:eq:" + mine.documentId)}&filter=${encodeURIComponent("action:eq:publish")}`)).json()).data as any[];
    expect(published.length, "the item was published").toBeGreaterThanOrEqual(1);
    expect([published[0].tenantKey, published[0].adminEmail], "as dga, by the scheduler").toEqual(["dga", "scheduler@webx"]);
    const foreign = (await (await ctl(`/audit?filter=${encodeURIComponent("entryId:eq:" + theirs.documentId)}&filter=${encodeURIComponent("action:eq:publish")}`)).json()).data as any[];
    expect(foreign, "pea's service was not published by dga's release").toEqual([]);
  });
});
