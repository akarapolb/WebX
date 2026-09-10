// A background job's acting session (Phase 9, M4) fails closed. Every refusal
// here happens before any network call: the job never gets as far as asking
// the CMS.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { actingSession, sessionEngine, withActingSession, type ActingSession } from "../lib/strapi";
import { assertNotActing, createAgentJob, controlAgentJob, governed, saveAgentPolicy, saveCustomRole } from "../lib/cms/governance";

const ACTING: ActingSession = {
  engine: "strapi", tenantKey: "dga", email: "editor@dga.local", jobId: "job-1",
  user: { id: 7, email: "editor@dga.local", roles: ["Editor"], isSuperAdmin: false },
};
const inJob = <T>(fn: () => Promise<T>, acting: ActingSession = ACTING) => withActingSession(acting, fn);
const refused = (pattern: RegExp) => (e: any) => e?.status === 403 && pattern.test(e.message);

describe("acting session", () => {
  test("supplies the engine without a request or cookie, and only inside the job", async () => {
    assert.equal(await inJob(() => sessionEngine()), "strapi");
    assert.equal(await inJob(() => sessionEngine(), { ...ACTING, engine: "wordpress" }), "wordpress");
    assert.equal(await inJob(async () => actingSession()?.tenantKey), "dga");
    assert.equal(actingSession(), undefined);
    assert.doesNotThrow(() => assertNotActing("anything"));
  });

  test("bookkeeping and settings content types are out of reach", async () => {
    const uids = [
      "api::tenant.tenant", "api::audit-log.audit-log", "api::custom-role.custom-role", "api::field-policy.field-policy",
      "api::agent-thread.agent-thread", "api::agent-job.agent-job", "api::release.release", "api::page-template.page-template",
    ];
    for (const uid of uids) {
      const notForJobs = refused(/not available to background jobs/);
      await assert.rejects(inJob(() => governed.list(uid)), notForJobs, `list ${uid}`);
      await assert.rejects(inJob(() => governed.get(uid, "x")), notForJobs, `get ${uid}`);
      await assert.rejects(inJob(() => governed.create(uid, {})), notForJobs, `create ${uid}`);
      await assert.rejects(inJob(() => governed.update(uid, "x", {})), notForJobs, `update ${uid}`);
    }
  });

  test("publishing, deleting, media, users, roles, policy and jobs are refused whatever the owner may do", async () => {
    const cases: [string, () => Promise<unknown>][] = [
      ["publish", () => governed.publish("api::article.article", "x")],
      ["unpublish", () => governed.unpublish("api::article.article", "x")],
      ["delete", () => governed.remove("api::article.article", "x")],
      ["delete media", () => governed.media.remove("1")],
      ["change media", () => governed.media.update("1", { caption: "x" })],
      ["create user", () => governed.auth.create("dga", { email: "new@dga.local", firstname: "N", lastname: "U", roleId: 1 })],
      ["remove user", () => governed.auth.remove("dga", { id: 1, email: "old@dga.local" })],
      ["agent policy", () => saveAgentPolicy("dga", { level: "draft_submit", background: true })],
      ["custom role", () => saveCustomRole("dga", { name: "Anything", permissions: {} } as any)],
      ["create job", () => createAgentJob({ goal: "Start another job" })],
      ["control job", () => controlAgentJob("job-2", "cancel")],
    ];
    for (const [name, run] of cases) await assert.rejects(inJob(run), refused(/^Background jobs cannot /), name);
  });
});
