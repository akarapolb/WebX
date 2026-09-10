// The background job store over strapi-cms's secret-protected internal
// endpoints (strapi-cms/src/api/internal/controllers/agent-jobs.ts). Every
// write there is a compare-and-set on the lease token; `false` here means the
// lease is gone and another worker owns the job now.
import "server-only";
import { STRAPI_INTERNAL_SECRET, STRAPI_URL } from "@/lib/config";
import { CmsError } from "@/lib/cms/types";
import type { AgentJobRow, JobStore } from "./types";

async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  if (!STRAPI_INTERNAL_SECRET) throw new CmsError("Background jobs need STRAPI_INTERNAL_SECRET to be configured", 500);
  const r = await fetch(`${STRAPI_URL}/api/internal/agent-jobs/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Secret": STRAPI_INTERNAL_SECRET },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new CmsError(`agent-jobs ${action} failed: ${j?.error || r.status}`, r.status);
  return j as T;
}

export const strapiJobStore: JobStore = {
  heartbeat: (id, leaseToken) => call("heartbeat", { documentId: id, leaseToken }),
  async checkpoint(id, leaseToken, patch) {
    return (await call<{ ok: boolean }>("checkpoint", { documentId: id, leaseToken, ...patch })).ok;
  },
  async finish(id, leaseToken, patch) {
    return (await call<{ ok: boolean }>("finish", { documentId: id, leaseToken, ...patch })).ok;
  },
};

/** Leases up to `limit` runnable jobs. `caps` is each tenant's concurrent-job limit. */
export async function claimJobs(workerId: string, limit: number, caps: Record<string, number>, defaultCap: number): Promise<AgentJobRow[]> {
  const j = await call<{ jobs: AgentJobRow[] }>("claim", { workerId, limit, caps, defaultCap });
  return Array.isArray(j.jobs) ? j.jobs : [];
}

export type JobControlAction = "cancel" | "pause" | "resume" | "answer";

/** A user's request on a job; the caller has already checked they may make it. */
export async function controlJob(documentId: string, action: JobControlAction, answer?: string) {
  return call<{ ok: boolean; job: Pick<AgentJobRow, "documentId" | "runState" | "stateReason"> & { cancelRequestedAt?: string | null; pauseRequestedAt?: string | null } }>(
    "control",
    { documentId, action, answer },
  );
}
