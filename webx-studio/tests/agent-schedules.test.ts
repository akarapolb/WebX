// Scheduled jobs (lib/agent/jobs/schedules.ts): whether an occurrence runs,
// is skipped or turns its schedule off, and the tick against a fake Strapi
// that does the same compare-and-set on runSeq.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  authorizationUntil, decideSchedule, isDue, occurrenceKey, runScheduleTick,
  type AgentScheduleRow, type AdvancePatch, type LastJob, type ScheduledJob, type TickDeps,
} from "../lib/agent/jobs/schedules";
import type { JobPolicy } from "../lib/agent/jobs/types";
import { parseRecurrence } from "../lib/agent/recurrence";

const POLICY: JobPolicy = { level: "draft", tools: null, contentTypes: null, model: "webx-kimi", dialect: "gov-portal", engine: "strapi", tenantKey: "dga" };
const OK = { ok: true as const, policy: POLICY };
const NOW = Date.parse("2026-09-11T02:00:30Z");
const TOMORROW = Date.parse("2026-09-12T02:00:00Z");

function sched(over: Partial<AgentScheduleRow> = {}): AgentScheduleRow {
  return {
    documentId: "s1", tenantKey: "dga", ownerEmail: "editor@dga.local", ownerUserId: "7", engine: "strapi",
    name: "Daily audit", template: "audit_all", params: { contentTypes: ["api::news.news"], max: 100 }, lang: "en",
    recurrence: parseRecurrence({ freq: "daily", hour: 9, minute: 0 }), enabled: true,
    nextRunAt: "2026-09-11T02:00:00.000Z", runSeq: 3, consecutiveFailures: 0,
    authorizedAt: "2026-09-01T00:00:00.000Z", authorizedUntil: authorizationUntil(Date.parse("2026-09-01T00:00:00Z")),
    requiredLevel: "read", ...over,
  };
}

const JOB: ScheduledJob = {
  tenantKey: "dga", ownerEmail: "editor@dga.local", ownerUserId: "7", engine: "strapi", template: "audit_all",
  title: "Audit News", goal: "Audit 3 entries of News.", params: {}, lang: "en", requiredLevel: "read", policySnapshot: POLICY, onQuestion: "auto",
};

const decide = (s: AgentScheduleRow, o: { owner?: any; schedulesOn?: boolean; lastJob?: LastJob } = {}) =>
  decideSchedule(s, { owner: OK, schedulesOn: true, lastJob: null, now: NOW, ...o });

describe("decideSchedule", () => {
  test("a due schedule runs and moves to its next occurrence", () => {
    assert.equal(isDue(sched(), NOW), true);
    assert.equal(isDue(sched({ enabled: false }), NOW), false);
    assert.equal(isDue(sched({ nextRunAt: "2026-09-12T02:00:00.000Z" }), NOW), false);
    assert.deepEqual(decide(sched()), { action: "run", next: TOMORROW, failures: 0, countedJobId: null });
    assert.equal(occurrenceKey(sched()), "sched:s1:2026-09-11T02:00:00.000Z");
  });

  test("a schedule whose owner, switches, template or authorization no longer hold is turned off", () => {
    assert.deepEqual(decide(sched(), { owner: { ok: false, reason: "owner_revoked" } }), { action: "disable", reason: "owner_revoked", failures: 0, countedJobId: null });
    assert.equal((decide(sched(), { schedulesOn: false }) as any).reason, "policy_changed");
    assert.equal((decide(sched({ template: "bulk_create" })) as any).reason, "template");
    assert.equal((decide(sched({ authorizedUntil: "2026-09-11T00:00:00.000Z" })) as any).reason, "reauthorize");
  });

  test("a job still going skips the occurrence, each finished job counts once, and three failures in a row turn it off", () => {
    assert.deepEqual(decide(sched({ lastJobId: "j1" }), { lastJob: { runState: "running" } }), { action: "skip", reason: "previous_running", next: TOMORROW, failures: 0, countedJobId: null });
    assert.deepEqual(decide(sched({ lastJobId: "j1", consecutiveFailures: 1 }), { lastJob: { runState: "failed" } }), { action: "run", next: TOMORROW, failures: 2, countedJobId: "j1" });
    assert.deepEqual(
      decide(sched({ lastJobId: "j1", countedJobId: "j1", consecutiveFailures: 2 }), { lastJob: { runState: "failed" } }),
      { action: "run", next: TOMORROW, failures: 2, countedJobId: "j1" },
      "a job already counted isn't counted again",
    );
    assert.deepEqual(
      decide(sched({ lastJobId: "j2", countedJobId: "j1", consecutiveFailures: 2 }), { lastJob: { runState: "done", outcome: "partial_stuck" } }),
      { action: "disable", reason: "failures", failures: 3, countedJobId: "j2" },
    );
    assert.deepEqual(
      decide(sched({ lastJobId: "j2", countedJobId: "j1", consecutiveFailures: 2 }), { lastJob: { runState: "done", outcome: "completed" } }),
      { action: "run", next: TOMORROW, failures: 0, countedJobId: "j2" },
    );
  });
});

describe("runScheduleTick", () => {
  function fakeStrapi(rows: AgentScheduleRow[]) {
    const seq = new Map(rows.map((r) => [r.documentId, r.runSeq ?? 0]));
    const jobs = new Map<string, string>();
    const advances: ({ id: string } & AdvancePatch)[] = [];
    const deps = (over: Partial<TickDeps> = {}): TickDeps => ({
      now: () => NOW,
      due: async () => structuredClone(rows),
      owner: async () => ({ verdict: OK, schedulesOn: true }),
      lastJob: async () => null,
      prepare: async () => ({ job: JOB }),
      async advance(s, p) {
        await new Promise((r) => setTimeout(r, 1));
        if (seq.get(s.documentId) !== p.expectedSeq) return { ok: false };
        seq.set(s.documentId, p.expectedSeq + 1);
        advances.push({ id: s.documentId, ...p });
        if (!p.job) return { ok: true, jobId: null };
        const existing = jobs.get(p.job.idempotencyKey);
        if (existing) return { ok: true, jobId: existing, existing: true };
        const id = `job-${jobs.size + 1}`;
        jobs.set(p.job.idempotencyKey, id);
        return { ok: true, jobId: id };
      },
      async disable(s, _reason, p) {
        if (seq.get(s.documentId) !== p.expectedSeq) return false;
        seq.set(s.documentId, p.expectedSeq + 1);
        return true;
      },
      ...over,
    });
    return { deps, jobs, advances };
  }

  test("two ticks at the same time start one job for the occurrence", async () => {
    const strapi = fakeStrapi([sched()]);
    const started: string[] = [];
    const deps = strapi.deps({ onStarted: async (_s, id) => void started.push(id) });

    const [a, b] = await Promise.all([runScheduleTick(deps), runScheduleTick(deps)]);

    assert.deepEqual([...a.started, ...b.started], ["job-1"]);
    assert.deepEqual([...a.lost, ...b.lost], ["s1"]);
    assert.deepEqual(started, ["job-1"]);
    assert.equal(strapi.advances[0].job?.idempotencyKey, "sched:s1:2026-09-11T02:00:00.000Z");
    assert.equal(strapi.advances[0].nextRunAt, "2026-09-12T02:00:00.000Z");
  });

  test("an occurrence with nothing to do moves on without a job, and an owner who left turns the schedule off", async () => {
    const strapi = fakeStrapi([sched(), sched({ documentId: "s2" }), sched({ documentId: "s3", nextRunAt: "2026-09-12T02:00:00.000Z" })]);
    const disabled: string[] = [];
    const report = await runScheduleTick(strapi.deps({
      owner: async (s) => ({ verdict: s.documentId === "s2" ? { ok: false, reason: "owner_revoked" } : OK, schedulesOn: true }),
      prepare: async () => ({ skip: "nothing_to_do" }),
      onDisabled: async (s, reason) => void disabled.push(`${s.documentId}:${reason}`),
    }));

    assert.equal(report.due, 2, "s3 isn't due yet");
    assert.deepEqual(report.skipped, [{ id: "s1", reason: "nothing_to_do" }]);
    assert.deepEqual(report.disabled, [{ id: "s2", reason: "owner_revoked" }]);
    assert.deepEqual(disabled, ["s2:owner_revoked"]);
    assert.equal(strapi.jobs.size, 0);
  });

  test("a schedule that throws doesn't stop the others", async () => {
    const strapi = fakeStrapi([sched(), sched({ documentId: "s2" })]);
    const report = await runScheduleTick(strapi.deps({
      prepare: async (s) => {
        if (s.documentId === "s1") throw new Error("Strapi unreachable");
        return { job: JOB };
      },
    }));
    assert.deepEqual(report.errors, [{ id: "s1", message: "Strapi unreachable" }]);
    assert.equal(report.started.length, 1);
  });
});
