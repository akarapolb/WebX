// Scheduled background jobs (Phase 9, M6). The tick (app/api/internal/agent/tick)
// takes each due schedule, decides whether this occurrence runs, is skipped
// or turns the schedule off, and advances it with a compare-and-set on the
// schedule's runSeq in Strapi, so ticks running at the same time start one job
// per occurrence. Pure: Strapi, the owner lookup and the template expansion
// are injected.
import { nextOccurrence, type Recurrence } from "../recurrence";
import type { AgentLevel } from "../types";
import { isTemplateKey, TEMPLATES } from "./templates";
import type { JobPolicy, OwnerRefusal } from "./types";

export const MAX_CONSECUTIVE_FAILURES = 3;
/** A schedule runs on its owner's authority for this long after they last saved or turned it on. */
export const AUTHORIZATION_DAYS = 90;

export type ScheduleDisableReason = OwnerRefusal | "reauthorize" | "failures" | "template" | "user";
export type ScheduleSkipReason = "previous_running" | "nothing_to_do" | "plan_limit";

export type AgentScheduleRow = {
  documentId: string;
  tenantKey: string;
  ownerEmail: string;
  ownerUserId: string;
  engine: "strapi" | "wordpress";
  name: string;
  template: string;
  params?: Record<string, any> | null;
  lang?: "en" | "th";
  recurrence: Recurrence;
  enabled: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastJobId?: string | null;
  /** The last finished job already counted toward consecutiveFailures. */
  countedJobId?: string | null;
  consecutiveFailures?: number;
  lastSkipReason?: string | null;
  disabledReason?: string | null;
  disabledAt?: string | null;
  authorizedAt?: string | null;
  authorizedUntil?: string | null;
  requiredLevel: AgentLevel;
  policySnapshot?: JobPolicy | null;
  budget?: { maxTokens?: number; maxMinutes?: number } | null;
  /** Bumped by every tick change; the compare-and-set token. */
  runSeq?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type LastJob = { runState: string; outcome?: string | null } | null;
export type OwnerVerdict = { ok: true; policy: JobPolicy } | { ok: false; reason: OwnerRefusal };

type Counting = { failures: number; countedJobId: string | null };

export type ScheduleDecision =
  | ({ action: "disable"; reason: ScheduleDisableReason } & Counting)
  | ({ action: "skip"; reason: "previous_running"; next: number } & Counting)
  | ({ action: "run"; next: number } & Counting);

const FINISHED = new Set(["done", "failed", "cancelled"]);

export const isDue = (s: Pick<AgentScheduleRow, "enabled" | "nextRunAt">, now: number) =>
  Boolean(s.enabled && s.nextRunAt && Date.parse(s.nextRunAt) <= now);

/** The job an occurrence creates carries this key, so it is never created twice. */
export const occurrenceKey = (s: Pick<AgentScheduleRow, "documentId" | "nextRunAt">) => `sched:${s.documentId}:${s.nextRunAt}`;

export const authorizationUntil = (from: number) => new Date(from + AUTHORIZATION_DAYS * 86_400_000).toISOString();

export function decideSchedule(
  s: AgentScheduleRow,
  f: { owner: OwnerVerdict; schedulesOn: boolean; lastJob: LastJob; now: number },
): ScheduleDecision {
  const prior: Counting = { failures: s.consecutiveFailures ?? 0, countedJobId: s.countedJobId ?? null };
  if (!f.owner.ok) return { action: "disable", reason: f.owner.reason, ...prior };
  if (!f.schedulesOn) return { action: "disable", reason: "policy_changed", ...prior };
  if (!isTemplateKey(s.template) || !TEMPLATES[s.template].schedulable) return { action: "disable", reason: "template", ...prior };
  if (!s.authorizedUntil || Date.parse(s.authorizedUntil) <= f.now) return { action: "disable", reason: "reauthorize", ...prior };

  // Each finished job counts once toward a run of failures.
  let counting = prior;
  const last = f.lastJob;
  if (last && s.lastJobId && FINISHED.has(last.runState) && s.countedJobId !== s.lastJobId) {
    const failed = last.runState === "failed" || last.outcome === "partial_stuck";
    counting = { failures: failed ? prior.failures + 1 : 0, countedJobId: s.lastJobId };
  }
  if (counting.failures >= MAX_CONSECUTIVE_FAILURES) return { action: "disable", reason: "failures", ...counting };

  const next = nextOccurrence(s.recurrence, f.now);
  if (last && !FINISHED.has(last.runState)) return { action: "skip", reason: "previous_running", next, ...counting };
  return { action: "run", next, ...counting };
}

export type ScheduledJob = {
  tenantKey: string;
  ownerEmail: string;
  ownerUserId: string;
  engine: "strapi" | "wordpress";
  template: string;
  title: string;
  goal: string;
  params: Record<string, any>;
  lang: "en" | "th";
  requiredLevel: AgentLevel;
  policySnapshot: JobPolicy;
  onQuestion: "auto";
  budget?: { maxTokens?: number; maxMinutes?: number } | null;
};

export type Prepared = { job: ScheduledJob } | { skip: "nothing_to_do" | "plan_limit" } | { disable: ScheduleDisableReason };
export type AdvancePatch = Counting & { expectedSeq: number; nextRunAt: string; skipReason?: ScheduleSkipReason; job?: ScheduledJob & { idempotencyKey: string } };
export type DisablePatch = Counting & { expectedSeq: number };

export type TickDeps = {
  now(): number;
  due(): Promise<AgentScheduleRow[]>;
  owner(s: AgentScheduleRow): Promise<{ verdict: OwnerVerdict; schedulesOn: boolean }>;
  lastJob(jobId: string): Promise<LastJob>;
  /** The job this occurrence creates (the template expanded as the owner), or why there is none. */
  prepare(s: AgentScheduleRow, policy: JobPolicy): Promise<Prepared>;
  /** false: another tick changed the schedule first. */
  advance(s: AgentScheduleRow, patch: AdvancePatch): Promise<{ ok: boolean; jobId?: string | null; existing?: boolean }>;
  disable(s: AgentScheduleRow, reason: ScheduleDisableReason, patch: DisablePatch): Promise<boolean>;
  /** After an occurrence created its job: metering, audit, waking the worker. */
  onStarted?(s: AgentScheduleRow, jobId: string): Promise<void>;
  onDisabled?(s: AgentScheduleRow, reason: ScheduleDisableReason): Promise<void>;
};

export type TickReport = {
  due: number;
  started: string[];
  skipped: { id: string; reason: ScheduleSkipReason }[];
  disabled: { id: string; reason: ScheduleDisableReason }[];
  /** Another tick got to these first. */
  lost: string[];
  errors: { id: string; message: string }[];
};

export async function runScheduleTick(d: TickDeps): Promise<TickReport> {
  const report: TickReport = { due: 0, started: [], skipped: [], disabled: [], lost: [], errors: [] };
  for (const s of await d.due()) {
    const now = d.now();
    if (!isDue(s, now)) continue;
    report.due++;
    const expectedSeq = s.runSeq ?? 0;
    try {
      const { verdict, schedulesOn } = await d.owner(s);
      const lastJob = s.lastJobId ? await d.lastJob(s.lastJobId) : null;
      const decision = decideSchedule(s, { owner: verdict, schedulesOn, lastJob, now });
      const counting: Counting = { failures: decision.failures, countedJobId: decision.countedJobId };

      const turnOff = async (reason: ScheduleDisableReason) => {
        if (!(await d.disable(s, reason, { ...counting, expectedSeq }))) return void report.lost.push(s.documentId);
        report.disabled.push({ id: s.documentId, reason });
        await d.onDisabled?.(s, reason);
      };
      const skip = async (reason: ScheduleSkipReason, next: number) => {
        const r = await d.advance(s, { ...counting, expectedSeq, nextRunAt: new Date(next).toISOString(), skipReason: reason });
        if (r.ok) report.skipped.push({ id: s.documentId, reason });
        else report.lost.push(s.documentId);
      };

      if (decision.action === "disable") {
        await turnOff(decision.reason);
        continue;
      }
      if (decision.action === "skip") {
        await skip(decision.reason, decision.next);
        continue;
      }
      if (!verdict.ok) continue; // decideSchedule turns these off; this only narrows the type
      const prepared = await d.prepare(s, verdict.policy);
      if ("disable" in prepared) {
        await turnOff(prepared.disable);
        continue;
      }
      if ("skip" in prepared) {
        await skip(prepared.skip, decision.next);
        continue;
      }
      const r = await d.advance(s, {
        ...counting, expectedSeq, nextRunAt: new Date(decision.next).toISOString(),
        job: { ...prepared.job, idempotencyKey: occurrenceKey(s) },
      });
      if (!r.ok) {
        report.lost.push(s.documentId);
        continue;
      }
      if (r.jobId && !r.existing) {
        report.started.push(r.jobId);
        await d.onStarted?.(s, r.jobId);
      }
    } catch (e) {
      report.errors.push({ id: s.documentId, message: (e as Error)?.message || String(e) });
    }
  }
  return report;
}
