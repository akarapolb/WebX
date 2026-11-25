import { test, expect, type BrowserContext } from "@playwright/test";
import {
  WEBX_STUDIO, STRAPI_SCHEDULER_PASSWORD, studioContext,
  DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD,
  PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD,
} from "./_helpers";

// Track C5 (docs/target-architecture.md), the first visitors' routes: a visitor's browser posts its cookie choice
// (POST /api/consent-logs) and its searches (POST /api/search-stats/log) to webx-control, and Studio's screens read them from there.
//   - the post is made the way the public site's browser makes it (from an origin webx-control allows, no sign-in);
//   - the Cookie Consent screen's API lists an editor their own workspace's choices (control plane and Strapi together)
//     and no other workspace's, and reads one by id only inside its workspace;
//   - the choices cannot be edited or deleted through Studio;
//   - searches are counted per query, personal data in a query is never kept, and the search insights API shows an editor
//     their own workspace's counts only;
//   - the form inboxes: a visitor's complaint (with a file) is taken by the control plane with its personal data encrypted, tracked
//     by its reference number, listed to the editors of its own workspace only (next to the engine's own submissions), changed
//     and deleted through Studio in its own workspace only, and its file is served to that workspace's editors only;
//   - with Strapi given the same control plane (ANALYTICS_READS_CONTROL=1), the dashboard's cookie numbers and its
//     recent activity come from there too, and the monthly report still builds.
// Same stack as audit-control-plane.spec.ts: AUDIT_CONTROL_URL / AUDIT_CONTROL_TOKEN.
const CONTROL = (process.env.AUDIT_CONTROL_URL || "").replace(/\/$/, "");
const TOKEN = process.env.AUDIT_CONTROL_TOKEN || "";
// the admin token, to register the two workspaces the choices are posted for (a fresh control plane has none, and a post for
// a workspace it does not know is filed under the first one, or refused when there is none)
const ADMIN = process.env.AUDIT_CONTROL_ADMIN_TOKEN || "";
const CL = "api::consent-log.consent-log";
const SS = "api::search-stat.search-stat";
const COMPLAINT = "api::complaint.complaint";
// the public site's development origin, one webx-control allows by default
const SITE = "http://localhost:3100";

test.describe("Visitors' routes in the control plane: cookie consent, search statistics and forms", () => {
  test.skip(
    !CONTROL || !TOKEN || !ADMIN || !DGA_EDITOR_PASSWORD || !PEA_EDITOR_PASSWORD || !STRAPI_SCHEDULER_PASSWORD,
    "AUDIT_CONTROL_URL, AUDIT_CONTROL_TOKEN, AUDIT_CONTROL_ADMIN_TOKEN, DGA_EDITOR_PASSWORD, PEA_EDITOR_PASSWORD and STRAPI_SCHEDULER_PASSWORD required"
  );

  const loginAs = studioContext;

  const stamp = Date.now();
  // one address per post: the route is rate-limited per address (X-Forwarded-For)
  let n = 0;
  const visit = (tenant: string, data: object) =>
    fetch(`${CONTROL}/api/consent-logs?tenant=${tenant}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SITE, "x-forwarded-for": `10.77.${stamp % 250}.${++n}` },
      body: JSON.stringify({ data }),
    });
  const search = (tenant: string, data: object) =>
    fetch(`${CONTROL}/api/search-stats/log?tenant=${tenant}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SITE, "x-forwarded-for": `10.78.${stamp % 250}.${++n}` },
      body: JSON.stringify(data),
    });
  const control = (path: string, init: RequestInit = {}) =>
    fetch(`${CONTROL}/internal${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers || {}) } });

  let dga: BrowserContext;
  let pea: BrowserContext;
  let dgaPost: Response;
  let dgaId = "";
  let peaId = "";
  const dgaConsentId = `e2e-dga-${stamp}`;
  const peaConsentId = `e2e-pea-${stamp}`;
  const summary = async (ctx: BrowserContext, tenant: string) => {
    const r = await ctx.request.get(`${WEBX_STUDIO}/api/strapi/api/analytics/summary?tenant=${tenant}`);
    expect(r.ok(), `the analytics summary answered ${r.status()}`).toBeTruthy();
    return r.json();
  };
  const analyticsFromControl = process.env.ANALYTICS_READS_CONTROL === "1";
  let consentBefore: any;

  test.beforeAll(async ({ browser }) => {
    [dga, pea] = await Promise.all([
      loginAs(browser, DGA_EDITOR_EMAIL, DGA_EDITOR_PASSWORD),
      loginAs(browser, PEA_EDITOR_EMAIL, PEA_EDITOR_PASSWORD),
    ]);
    for (const key of ["dga", "pea"]) {
      const r = await fetch(`${CONTROL}/admin/tenants/${key}`, { method: "PUT", headers: { Authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body: JSON.stringify({ engine: "strapi", publicTemplate: "gov-portal" }) });
      expect(r.ok, `registering ${key} answered ${r.status}`).toBeTruthy();
    }
    if (analyticsFromControl) consentBefore = (await summary(dga, "dga")).consent;
    dgaPost = await visit("dga", { consentId: dgaConsentId, action: "accept_all", categories: { necessary: true, analytics: true, marketing: false }, language: "th", path: "/", userAgent: "e2e" });
    const peaPost = await visit("pea", { consentId: peaConsentId, action: "reject_all", categories: { necessary: true, analytics: false, marketing: false }, language: "th", path: "/pea", userAgent: "e2e" });
    expect(dgaPost.status, "the visitor's post is accepted").toBe(201);
    expect(peaPost.status).toBe(201);
    dgaId = (await dgaPost.clone().json()).data.documentId;
    peaId = (await peaPost.json()).data.documentId;
  });

  test.afterAll(async () => {
    await dga?.close();
    await pea?.close();
  });

  test("the control plane answers a visitor's browser: a preflight, and the post names the public site's origin", async () => {
    const pre = await fetch(`${CONTROL}/api/consent-logs?tenant=dga`, { method: "OPTIONS", headers: { origin: SITE, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(dgaPost.headers.get("access-control-allow-origin"), "the post itself carries the origin").toBe(SITE);
    const stranger = await fetch(`${CONTROL}/api/consent-logs?tenant=dga`, { method: "OPTIONS", headers: { origin: "https://evil.example.com", "access-control-request-method": "POST" } });
    expect(stranger.headers.get("access-control-allow-origin"), "an origin that is not listed is not allowed").toBeNull();
  });

  const consentIds = async (ctx: BrowserContext) => {
    const r = await ctx.request.get(`${WEBX_STUDIO}/api/cms/entries/${CL}?pageSize=200&sort=createdAt:DESC`);
    expect(r.ok(), `the consent list answered ${r.status()}`).toBeTruthy();
    return ((await r.json()).data as any[]).map((x) => x.consentId as string);
  };

  test("the Cookie Consent list shows an editor their workspace's choices from the control plane, and no other workspace's", async () => {
    const mine = await consentIds(dga);
    expect(mine, "dga sees its own choice").toContain(dgaConsentId);
    expect(mine, "dga does not see pea's").not.toContain(peaConsentId);
    const theirs = await consentIds(pea);
    expect(theirs).toContain(peaConsentId);
    expect(theirs, "pea does not see dga's").not.toContain(dgaConsentId);
  });

  test("a choice is read by id inside its workspace only", async () => {
    const own = await dga.request.get(`${WEBX_STUDIO}/api/cms/entries/${CL}/${dgaId}`);
    expect(own.ok(), `own choice answered ${own.status()}`).toBeTruthy();
    const body = await own.json();
    const row = body.data ?? body;
    expect(row.consentId).toBe(dgaConsentId);
    const other = await pea.request.get(`${WEBX_STUDIO}/api/cms/entries/${CL}/${dgaId}`);
    expect(other.ok(), "another workspace must not read it").toBeFalsy();
    expect([403, 404]).toContain(other.status());
  });

  test("a choice cannot be edited or deleted through Studio", async () => {
    const edit = await dga.request.put(`${WEBX_STUDIO}/api/cms/entries/${CL}/${dgaId}`, { data: { action: "reject_all" } });
    expect(edit.ok(), "editing a consent row must be refused").toBeFalsy();
    const del = await dga.request.delete(`${WEBX_STUDIO}/api/cms/entries/${CL}/${dgaId}`);
    expect(del.ok(), "deleting a consent row must be refused").toBeFalsy();
    const kept = (await (await control(`/records/consent-log/${dgaId}`)).json()).data;
    expect(kept.action, "the row is unchanged").toBe("accept_all");
    expect(kept.tenantKey).toBe("dga");
  });

  // letters only: a long run of digits in a query is taken for a phone number and not kept
  const word = String(stamp).replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
  const searchRows = async (ctx: BrowserContext, asking: string) => {
    const filter = encodeURIComponent(JSON.stringify([{ field: "tenant.key", op: "eq", value: asking }]));
    const r = await ctx.request.get(`${WEBX_STUDIO}/api/cms/entries/${SS}?pageSize=500&sort=count:DESC&filter=${filter}`);
    expect(r.ok(), `the search statistics answered ${r.status()}`).toBeTruthy();
    return (await r.json()).data as any[];
  };

  test("searches are counted per query by the control plane, and the search insights API shows an editor their own workspace's", async () => {
    const mine = `e2e dga ${word}`, theirs = `e2e pea ${word}`;
    for (const results of [4, 0]) expect((await search("dga", { q: mine.toUpperCase(), locale: "th", results })).status, "a search is counted").toBe(204);
    expect((await search("pea", { q: theirs, locale: "en", results: 1 })).status).toBe(204);
    expect((await search("dga", { q: "somchai@example.com", results: 1 })).status, "personal data is dropped with the same answer").toBe(204);
    expect((await search("dga", { q: "081-234-5678", results: 1 })).status).toBe(204);

    const dgaRows = await searchRows(dga, "dga");
    const row = dgaRows.find((r) => r.query === mine);
    expect(row, "dga's search is in its statistics, however it was typed").toBeTruthy();
    expect([row.count, row.zeroCount, row.results], "two searches, one of them found nothing, the last found nothing").toEqual([2, 1, 0]);
    expect(dgaRows.some((r) => /@|081/.test(r.query)), "an address or a phone number was never stored").toBeFalsy();
    expect(dgaRows.some((r) => r.query === theirs), "dga does not see pea's").toBeFalsy();

    const peaRows = await searchRows(pea, "dga"); // pea's editor names dga's key and still gets only pea's own
    expect(peaRows.some((r) => r.query === theirs), "pea sees its own search").toBeTruthy();
    expect(peaRows.some((r) => r.query === mine), "pea cannot read dga's statistics by naming them").toBeFalsy();
  });

  // ---- the form inboxes
  const visitorIp = () => `10.79.${stamp % 250}.${++n}`;
  const solved = async () => {
    const c = (await (await fetch(`${CONTROL}/api/captcha`, { headers: { "x-forwarded-for": visitorIp() } })).json()).data;
    const [a, b] = c.question.match(/\d+/g).map(Number);
    return { captchaId: c.id, captchaAnswer: String(a + b) };
  };
  const complain = async (tenant: string, data: object) =>
    fetch(`${CONTROL}/api/complaints?tenant=${tenant}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SITE, "x-forwarded-for": visitorIp() },
      body: JSON.stringify({ data, ...(await solved()) }),
    });
  const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
  const subjectOf = (who: string) => `e2e complaint ${who} ${word}`;
  let dgaComplaint = { id: "", ref: "" };
  let peaComplaint = { id: "", ref: "" };
  let withFile = { id: "", ref: "", fileId: "" };
  const complaints = async (ctx: BrowserContext) => {
    const r = await ctx.request.get(`${WEBX_STUDIO}/api/cms/entries/${COMPLAINT}?pageSize=100&sort=createdAt:DESC`);
    expect(r.ok(), `the complaints list answered ${r.status()}`).toBeTruthy();
    return (await r.json()).data as any[];
  };
  const track = async (ref: string, tenant: string) => (await fetch(`${CONTROL}/api/complaints/track/${ref}?tenant=${tenant}`, { headers: { "x-forwarded-for": visitorIp() } })).json();
  const held = async (id: string) => (await (await control(`/records/complaint/${id}`)).json()).data;

  test("a visitor's complaint is taken by the control plane, tracked by its reference, and its mail is queued", async () => {
    const mine = await complain("dga", { type: "อื่นๆ", subject: subjectOf("dga"), detail: "รายละเอียด", name: "ผู้แจ้ง ดีจีเอ", email: "citizen-dga@example.com", phone: "0811111111", date: "25/11/2569" });
    expect(mine.status, "the visitor's post is accepted").toBe(201);
    expect(mine.headers.get("access-control-allow-origin")).toBe(SITE);
    const m = (await mine.json()).data;
    expect(m.ref).toMatch(/^DGA-CMP-\d{4}-\d{6}$/);
    dgaComplaint = { id: m.documentId, ref: m.ref };
    const theirs = await complain("pea", { type: "อื่นๆ", subject: subjectOf("pea"), detail: "d", name: "ผู้แจ้ง พีอีเอ", email: "citizen-pea@example.com" });
    expect(theirs.status).toBe(201);
    const t = (await theirs.json()).data;
    peaComplaint = { id: t.documentId, ref: t.ref };
    expect((await track(m.ref, "dga")).data.subject, "a citizen tracks it by its reference").toBe(subjectOf("dga"));
    expect((await track(m.ref, "pea")).error?.name, "but only in its own workspace").toBe("NotFoundError");
    const box = (await (await control("/outbox?tenant=dga")).json()).data;
    expect(box.recent.some((x: any) => x.kind === "complaint-ack"), "the citizen's acknowledgement is queued (no mail server is set here)").toBeTruthy();
    expect(JSON.stringify(box), "the outbox shows no address").not.toContain("citizen-dga@example.com");
  });

  test("the Forms inbox API lists an editor their workspace's submissions with the personal data readable, and no other workspace's", async () => {
    const mine = await complaints(dga);
    const row = mine.find((r) => r.documentId === dgaComplaint.id);
    expect(row, "dga sees its complaint, taken by the control plane").toBeTruthy();
    expect([row.ref, row.subject, row.name, row.email, row.stage]).toEqual([dgaComplaint.ref, subjectOf("dga"), "ผู้แจ้ง ดีจีเอ", "citizen-dga@example.com", 0]);
    expect(mine.some((r) => r.documentId === peaComplaint.id), "dga does not see pea's").toBeFalsy();
    const theirs = await complaints(pea);
    expect(theirs.some((r) => r.documentId === peaComplaint.id)).toBeTruthy();
    expect(theirs.some((r) => r.documentId === dgaComplaint.id), "pea does not see dga's").toBeFalsy();
  });

  test("a submission is read by id inside its workspace only", async () => {
    const own = await dga.request.get(`${WEBX_STUDIO}/api/cms/entries/${COMPLAINT}/${dgaComplaint.id}`);
    expect(own.ok(), `own submission answered ${own.status()}`).toBeTruthy();
    const body = await own.json();
    expect((body.data ?? body).subject).toBe(subjectOf("dga"));
    const other = await pea.request.get(`${WEBX_STUDIO}/api/cms/entries/${COMPLAINT}/${dgaComplaint.id}`);
    expect(other.ok(), "another workspace must not read it").toBeFalsy();
    expect([403, 404]).toContain(other.status());
  });

  test("an editor moves a submission on through Studio, in their own workspace only, and cannot change what the server owns", async () => {
    const byPea = await pea.request.put(`${WEBX_STUDIO}/api/cms/entries/${COMPLAINT}/${dgaComplaint.id}`, { data: { stage: 9 } });
    expect(byPea.ok(), "pea must not change dga's complaint").toBeFalsy();
    expect((await held(dgaComplaint.id)).stage).toBe(0);
    const own = await dga.request.put(`${WEBX_STUDIO}/api/cms/entries/${COMPLAINT}/${dgaComplaint.id}`, { data: { stage: 2, steps: [{ at: "2026-11-26", note: "รับเรื่อง" }], ref: "FORGED", tenantKey: "pea", name: "ผู้แจ้ง (แก้ไข)" } });
    expect(own.ok(), `own update answered ${own.status()}`).toBeTruthy();
    const after = await held(dgaComplaint.id);
    expect([after.stage, after.ref, after.tenantKey, after.name]).toEqual([2, dgaComplaint.ref, "dga", "ผู้แจ้ง (แก้ไข)"]);
    const seen = (await track(dgaComplaint.ref, "dga")).data;
    expect([seen.stage, seen.steps?.[0]?.note], "the citizen then sees the new stage and the step").toEqual([2, "รับเรื่อง"]);
  });

  test("a file the citizen attaches is served to the workspace's editors only, and goes when the submission does", async () => {
    const fd = new FormData();
    fd.append("data", JSON.stringify({ type: "อื่นๆ", subject: subjectOf("file"), detail: "d", name: "ผู้แจ้ง", email: "citizen-file@example.com" }));
    const cap = await solved();
    fd.append("captchaId", cap.captchaId);
    fd.append("captchaAnswer", cap.captchaAnswer);
    fd.append("files.attachment", new Blob([PDF], { type: "application/pdf" }), "หลักฐาน.pdf");
    const posted = await fetch(`${CONTROL}/api/complaints/submit?tenant=dga`, { method: "POST", body: fd, headers: { origin: SITE, "x-forwarded-for": visitorIp() } });
    expect(posted.status, "a complaint with a file is accepted").toBe(201);
    const p = (await posted.json()).data;
    const row = (await complaints(dga)).find((r) => r.documentId === p.documentId);
    expect(row?.attachment?.name).toBe("หลักฐาน.pdf");
    expect(row.attachment.url, "Studio gives the file a url of its own").toBe(`/api/cms/forms-file/${row.attachment.documentId}`);
    withFile = { id: p.documentId, ref: p.ref, fileId: row.attachment.documentId };
    const got = await dga.request.get(WEBX_STUDIO + row.attachment.url);
    expect(got.ok(), `the file download answered ${got.status()}`).toBeTruthy();
    expect(Buffer.from(await got.body()).equals(PDF)).toBeTruthy();
    expect(got.headers()["content-disposition"]).toMatch(/^attachment; filename=/);
    expect(got.headers()["x-content-type-options"]).toBe("nosniff");
    const other = await pea.request.get(WEBX_STUDIO + row.attachment.url);
    expect(other.ok(), "another workspace must not download it").toBeFalsy();
    expect(other.status()).toBe(403);

    const byPea = await pea.request.delete(`${WEBX_STUDIO}/api/cms/entries/${COMPLAINT}/${withFile.id}`);
    expect(byPea.ok(), "pea must not delete dga's complaint").toBeFalsy();
    const own = await dga.request.delete(`${WEBX_STUDIO}/api/cms/entries/${COMPLAINT}/${withFile.id}`);
    expect(own.ok(), `own delete answered ${own.status()}`).toBeTruthy();
    expect((await track(withFile.ref, "dga")).error?.name, "it is gone").toBe("NotFoundError");
    const gone = await fetch(`${CONTROL}/internal/files/${withFile.fileId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(gone.status, "and so is its file").toBe(404);
  });

  test("the dashboard's cookie numbers include the control plane's, and its recent activity comes from there", async () => {
    test.skip(!analyticsFromControl, "ANALYTICS_READS_CONTROL=1 (Strapi started with WEBX_CONTROL_URL and WEBX_CONTROL_SERVICE_TOKEN) required");
    const after = (await summary(dga, "dga")).consent;
    expect(after.total - consentBefore.total, "one more choice for dga").toBe(1);
    expect(after.accept - consentBefore.accept, "and it is an accept").toBe(1);
    expect(after.reject, "pea's rejection is not counted for dga").toBe(consentBefore.reject);

    const subs = (await summary(dga, "dga")).submissions;
    expect(subs.complaints, "the complaints the control plane took are counted next to the engine's").toBeGreaterThanOrEqual(1);
    // an audit row that exists only in the control plane is what the dashboard shows as recent activity
    const marker = "e2e.analytics." + stamp;
    const made = await control("/audit", { method: "POST", body: JSON.stringify({ data: { action: marker, tenantKey: "dga", adminEmail: DGA_EDITOR_EMAIL, contentType: "e2e", at: new Date().toISOString() } }) });
    expect(made.ok, `writing the audit row answered ${made.status}`).toBeTruthy();
    const recent = ((await summary(dga, "dga")).recentAudit as any[]).map((r) => r.action);
    expect(recent, "the dashboard reads the audit log from the control plane").toContain(marker);

    // the monthly report builds with the control plane configured (an .xlsx workbook)
    const month = new Date().toISOString().slice(0, 7);
    const report = await dga.request.get(`${WEBX_STUDIO}/api/strapi/api/analytics/report?month=${month}&tenant=dga`);
    expect(report.ok(), `the report answered ${report.status()}`).toBeTruthy();
    expect(report.headers()["content-type"]).toContain("spreadsheetml");
  });
});
