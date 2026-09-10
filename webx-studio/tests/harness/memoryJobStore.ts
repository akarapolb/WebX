// An in-memory job store for the slice runner. Rows go through JSON on every
// read and write, like the Strapi-backed store, and it plays the parts the
// real system splits across Strapi and the worker: claiming, reclaiming a
// crashed job's expired lease, and the user's cancel/pause/answer requests.
import type { AgentJobRow, JobEvent, JobStore } from "../../lib/agent/jobs/types";

export class SimulatedWorkerCrash extends Error {
  constructor() {
    super("simulated worker crash");
    this.name = "SimulatedWorkerCrash";
  }
}

const copy = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function memoryJobStore(initial: AgentJobRow[]) {
  const rows = new Map(initial.map((r) => [r.documentId, copy(r)]));
  const events = new Map<string, JobEvent[]>();
  let leaseSeq = 0;
  let crashOn: { at: string; nth: number; seen: number } | null = null;

  const row = (id: string) => {
    const r = rows.get(id);
    if (!r) throw new Error(`no job ${id}`);
    return r;
  };
  const leased = (id: string, lease: string) => rows.get(id)?.leaseToken === lease;
  const addEvents = (id: string, list: JobEvent[]) => events.set(id, [...(events.get(id) ?? []), ...copy(list)]);

  const store: JobStore = {
    async heartbeat(id, lease) {
      if (!leased(id, lease)) return { ok: false };
      const r = row(id);
      return { ok: true, cancelRequested: Boolean(r.cancelRequestedAt), pauseRequested: Boolean(r.pauseRequestedAt) };
    },
    async checkpoint(id, lease, patch) {
      if (!leased(id, lease)) return false;
      const r = row(id);
      Object.assign(r, {
        checkpoint: copy(patch.checkpoint), checkpointSeq: patch.checkpointSeq, eventSeq: patch.eventSeq,
        progress: copy(patch.progress), tokensUsed: patch.tokensUsed,
      });
      if (patch.clearAnswer) r.pendingAnswer = null;
      addEvents(id, patch.events);
      // Written, then the process dies: the checkpoint survives, the work after it doesn't happen.
      if (crashOn && patch.at === crashOn.at && ++crashOn.seen === crashOn.nth) {
        crashOn = null;
        throw new SimulatedWorkerCrash();
      }
      return true;
    },
    async finish(id, lease, patch) {
      if (!leased(id, lease)) return false;
      const r = row(id);
      // Same rules as strapi-cms's agent-jobs finish: a pending answer is cleared
      // only by the checkpoint that applied it, and a request arriving while a
      // slice ends as "queued" is kept for the next slice.
      const { events: list, ...rest } = patch;
      Object.assign(r, copy(rest), { leaseToken: null });
      r.notBefore = patch.runState === "queued" ? patch.notBefore ?? null : null;
      if (patch.runState !== "queued") Object.assign(r, { cancelRequestedAt: null, pauseRequestedAt: null });
      addEvents(id, list);
      return true;
    },
  };

  return {
    store,
    get: (id: string) => copy(row(id)),
    events: (id: string) => copy(events.get(id) ?? []),
    /** What the worker's claim does: a queued job becomes running under a fresh lease. */
    claim(id: string): AgentJobRow | null {
      const r = row(id);
      if (r.runState !== "queued") return null;
      Object.assign(r, { runState: "running", leaseToken: `lease-${++leaseSeq}` });
      return copy(r);
    },
    /** What reclaiming an expired lease does after a crash. */
    expireLease(id: string) {
      Object.assign(row(id), { runState: "queued", leaseToken: null, attempts: row(id).attempts + 1 });
    },
    stealLease(id: string) {
      row(id).leaseToken = "lease-of-another-worker";
    },
    requestCancel(id: string) {
      row(id).cancelRequestedAt = new Date().toISOString();
    },
    answer(id: string, text: string) {
      Object.assign(row(id), { pendingAnswer: text, runState: "queued", stateReason: null });
    },
    crashOnCheckpoint(at: "turn" | "pre_write" | "stop", nth = 1) {
      crashOn = { at, nth, seen: 0 };
    },
  };
}
