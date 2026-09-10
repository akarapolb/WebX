// Runs one slice of a direct template job (bulk_translate, audit_all): one tool
// call per item, no model. Same lease rules as the agent runner (runner.ts):
// heartbeat before each item, checkpoint after it, and stop for a cancel,
// pause or shutdown at the next item.
import type { EngineClock } from "../engine/types";
import type { AgentEvent } from "../types";
import type { RunnerDeps, SliceOutcome } from "./runner";
import { directReport, TEMPLATES, type DirectItem, type DirectResult } from "./templates";
import type { AgentJobRow, JobEvent, JobFinish, JobOwner, JobProgress, JobStore } from "./types";

export type DirectDeps = {
  store: JobStore;
  clock: EngineClock;
  asOwner: RunnerDeps["asOwner"];
  /** Handles one item as the job's owner. */
  runItem(job: AgentJobRow, owner: JobOwner, item: DirectItem): Promise<DirectResult>;
  every?: RunnerDeps["every"];
  shouldYield?: () => boolean;
  heartbeatMs?: number;
  itemsPerSlice?: number;
  sliceMs?: number;
};

type DirectState = { v: "direct"; cursor: number; results: DirectResult[] };

const isDirectState = (v: any): v is DirectState => Boolean(v) && v.v === "direct" && Number.isInteger(v.cursor) && Array.isArray(v.results);

export async function runDirectJobSlice(job: AgentJobRow, d: DirectDeps): Promise<SliceOutcome> {
  const id = job.documentId;
  const lease = job.leaseToken;
  if (!lease) throw new Error(`Job ${id} is not leased`);
  const key = job.template === "bulk_translate" ? "bulk_translate" : "audit_all";
  const tool = TEMPLATES[key].tool!;
  const items: DirectItem[] = Array.isArray(job.params?.items) ? job.params!.items : [];
  const state: DirectState = isDirectState(job.checkpoint) ? structuredClone(job.checkpoint) : { v: "direct", cursor: 0, results: [] };

  const flags = { cancel: false, pause: false, leaseLost: false };
  let eventSeq = job.eventSeq ?? 0;
  let checkpointSeq = job.checkpointSeq ?? 0;
  const pending: JobEvent[] = [];
  const emit = (e: AgentEvent) => {
    pending.push({ ...e, seq: ++eventSeq, at: new Date(d.clock.now()).toISOString() } as JobEvent);
  };
  const progress = (): JobProgress => ({
    turns: 0, toolCalls: state.results.length, tokens: 0, applied: 0, proposals: 0, plan: null, question: null, lastStop: null,
    done: state.cursor, total: items.length,
  });

  const beat = async () => {
    let r: Awaited<ReturnType<JobStore["heartbeat"]>>;
    try {
      r = await d.store.heartbeat(id, lease);
    } catch {
      return;
    }
    if (!r.ok) {
      flags.leaseLost = true;
      return;
    }
    if (r.cancelRequested) flags.cancel = true;
    if (r.pauseRequested) flags.pause = true;
  };
  const stopHeartbeat = d.every ? d.every(d.heartbeatMs ?? 20_000, () => void beat()) : () => {};

  try {
    const owned = await d.asOwner(job, async (owner) => {
      const t0 = d.clock.now();
      let handled = 0;
      while (state.cursor < items.length) {
        await beat();
        if (flags.leaseLost) return "lease_lost" as const;
        if (flags.cancel) return "cancelled" as const;
        if (d.shouldYield?.()) return "yield" as const;
        if (flags.pause) return "paused" as const;
        if (handled >= (d.itemsPerSlice ?? 10) || d.clock.now() - t0 >= (d.sliceMs ?? 120_000)) return "slice_end" as const;

        const item = items[state.cursor];
        const callId = `item-${state.cursor + 1}`;
        emit({ type: "tool_call", id: callId, name: tool, args: { uid: item.uid, id: item.id } });
        let r: DirectResult;
        try {
          r = await d.runItem(job, owner, item);
        } catch {
          r = { ...item, ok: false, summary: "Failed unexpectedly." };
        }
        state.results.push(r);
        state.cursor++;
        handled++;
        emit({ type: "tool_result", id: callId, ok: r.ok || Boolean(r.skipped), summary: `${item.title}: ${r.summary}` });

        const ok = await d.store.checkpoint(id, lease, {
          at: "turn", checkpoint: state, checkpointSeq: ++checkpointSeq, eventSeq,
          events: pending.splice(0), progress: progress(), tokensUsed: job.tokensUsed ?? 0,
        });
        if (!ok) {
          flags.leaseLost = true;
          return "lease_lost" as const;
        }
      }
      return "done" as const;
    });

    if (!owned.ok) {
      const ok = await d.store.finish(id, lease, { runState: "paused", stateReason: owned.reason, eventSeq, events: pending.splice(0) });
      return ok ? { state: "paused", reason: owned.reason } : { state: "lease_lost" };
    }
    const stop = owned.value;
    if (stop === "lease_lost") return { state: "lease_lost" };

    let f: JobFinish;
    let result: Record<string, any> | undefined;
    if (stop === "done") {
      const report = directReport(key, state.results, items.length, job.lang ?? "en");
      emit({ type: "text", content: report.text });
      f = { runState: "done", outcome: state.results.some((r) => !r.ok && !r.skipped) ? "incomplete" : "completed" };
      result = { finalText: report.text, counts: report.counts, items: state.results };
    } else if (stop === "slice_end" || stop === "yield") {
      f = { runState: "queued" };
    } else if (stop === "cancelled") {
      f = { runState: "cancelled", stateReason: "user" };
    } else {
      f = { runState: "paused", stateReason: "user" };
    }
    const ok = await d.store.finish(id, lease, {
      ...f, checkpoint: state, checkpointSeq: ++checkpointSeq, eventSeq, events: pending.splice(0), progress: progress(),
      ...(result ? { result } : {}),
    });
    return ok ? { state: f.runState, stop, reason: f.stateReason } : { state: "lease_lost", stop };
  } finally {
    stopHeartbeat();
  }
}
