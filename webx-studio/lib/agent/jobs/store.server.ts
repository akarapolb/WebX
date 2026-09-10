// Background jobs and schedules over strapi-cms's secret-protected internal
// endpoints (strapi-cms/src/api/internal/controllers/agent-jobs.ts and
// agent-schedules.ts). Every write there is a compare-and-set, on the lease
// token for jobs and on runSeq for schedules; `false` means someone else
// changed it first.
import "server-only";
import { STRAPI_INTERNAL_SECRET, STRAPI_URL } from "@/lib/config";
import { CmsError } from "@/lib/cms/types";
import type { AdvancePatch, AgentScheduleRow, DisablePatch } from "./schedules";
import type { AgentJobRow, JobStore } from "./types";

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!STRAPI_INTERNAL_SECRET) throw new CmsError("Background jobs need STRAPI_INTERNAL_SECRET to be configured", 500);
  const r = await fetch(`${STRAPI_URL}/api/internal/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": STRAPI_INTERNAL_SECRET },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new CmsError(`${path} failed: ${j?.error || r.status}`, r.status);
  return j as T;
}

export const strapiJobStore: JobStore = {
  heartbeat: (id, leaseToken) => call("agent-jobs/heartbeat", { documentId: id, leaseToken }),
  async checkpoint(id, leaseToken, patch) {
    return (await call<{ ok: boolean }>("agent-jobs/checkpoint", { documentId: id, leaseToken, ...patch })).ok;
  },
  async finish(id, leaseToken, patch) {
    return (await call<{ ok: boolean }>("agent-jobs/finish", { documentId: id, leaseToken, ...patch })).ok;
  },
};

/** Leases up to `limit` runnable jobs. `caps` is each tenant's concurrent-job limit. */
export async function claimJobs(workerId: string, limit: number, caps: Record<string, number>, defaultCap: number): Promise<AgentJobRow[]> {
  const j = await call<{ jobs: AgentJobRow[] }>("agent-jobs/claim", { workerId, limit, caps, defaultCap });
  return Array.isArray(j.jobs) ? j.jobs : [];
}

export type JobControlAction = "cancel" | "pause" | "resume" | "answer";

/** A user's request on a job; the caller has already checked they may make it. */
export async function controlJob(documentId: string, action: JobControlAction, answer?: string) {
  return call<{ ok: boolean; job: Pick<AgentJobRow, "documentId" | "runState" | "stateReason"> & { cancelRequestedAt?: string | null; pauseRequestedAt?: string | null } }>(
    "agent-jobs/control",
    { documentId, action, answer },
  );
}

/** Enabled schedules whose next run has come, by Strapi's clock. */
export async function dueSchedules(): Promise<AgentScheduleRow[]> {
  const j = await call<{ schedules: AgentScheduleRow[] }>("agent-schedules/due", {});
  return Array.isArray(j.schedules) ? j.schedules : [];
}

/** Moves a schedule to its next run, creating this occurrence's job when `patch.job` is set. */
export function advanceSchedule(documentId: string, patch: AdvancePatch) {
  return call<{ ok: boolean; jobId?: string | null; existing?: boolean }>("agent-schedules/advance", {
    documentId, expectedSeq: patch.expectedSeq, nextRunAt: patch.nextRunAt, consecutiveFailures: patch.failures,
    countedJobId: patch.countedJobId, skipReason: patch.skipReason, job: patch.job,
  });
}

export async function disableSchedule(documentId: string, reason: string, patch: DisablePatch): Promise<boolean> {
  const j = await call<{ ok: boolean }>("agent-schedules/disable", {
    documentId, reason, expectedSeq: patch.expectedSeq, consecutiveFailures: patch.failures, countedJobId: patch.countedJobId,
  });
  return j.ok;
}
