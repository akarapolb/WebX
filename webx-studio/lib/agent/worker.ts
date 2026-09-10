// The in-process background job worker: one per webx process, started from
// instrumentation.ts, with the tick route as a liveness backstop. Several
// processes can run workers at once because claiming is a compare-and-set in
// Strapi. Each claimed job runs one slice and goes back to the queue, so a
// long job doesn't hold a slot and tenants take turns. Agent jobs run the model
// (jobs/runner.ts); direct template jobs run one tool per item (jobs/direct.ts).
import "server-only";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { agentJobCaps, governed, runAsJobOwner } from "@/lib/cms/governance";
import { chat } from "@/lib/llm";
import { realClock } from "./engine/deps.server";
import { limitsFor } from "./engine/limits";
import type { EngineDeps } from "./engine/types";
import { runDirectJobSlice, type DirectDeps } from "./jobs/direct";
import { runJobSlice, type RunnerDeps, type SliceOutcome } from "./jobs/runner";
import { claimJobs, strapiJobStore } from "./jobs/store.server";
import { isTemplateKey, TEMPLATES, tickPlanForCreate, verifyBulkCreate, type DirectItem, type DirectResult } from "./jobs/templates";
import type { AgentJobRow, JobOwner } from "./jobs/types";
import { jobSystemPrompt } from "./prompts";
import { executeTool, toolIsWrite, toolSpecs } from "./tools";
import type { AgentEvent, AgentRunContext } from "./types";

const POLL_MS = 5_000;
const CONCURRENCY = Math.max(1, Number(process.env.AGENT_WORKER_CONCURRENCY) || 3);
const SLICE_TURNS = Math.max(1, Number(process.env.AGENT_SLICE_TURNS) || 8);
const SHUTDOWN_GRACE_MS = 20_000;
const REVIEW_UID = "api::review.review";
// auditRules.ts says "med"; job reports say "medium".
const SEVERITY: Record<string, string> = { med: "medium" };

function runContext(job: AgentJobRow, owner: JobOwner): AgentRunContext {
  // A job created with a tool list is limited to it, within what the owner's policy allows.
  const listed = job.params?.tools;
  const jobTools = Array.isArray(listed) ? (listed as string[]) : null;
  const policyTools = owner.policy.tools;
  const allowedTools = jobTools ? (policyTools ? policyTools.filter((t) => jobTools.includes(t)) : jobTools) : policyTools;
  return {
    user: owner.user, tenantKey: job.tenantKey, level: owner.policy.level,
    allowedTools, allowedContentTypes: owner.policy.contentTypes,
    model: owner.policy.model, runId: job.documentId, threadId: job.threadId || "", lang: job.lang ?? owner.lang,
    ref: { kind: "none" }, dialect: owner.policy.dialect, engine: owner.policy.engine,
  };
}

/** bulk_create: a created draft ticks its plan item, and an item marked done with no draft behind it is reopened. */
function templateHooks(job: AgentJobRow): Partial<Pick<EngineDeps, "afterTool" | "checkPlan">> {
  if (job.template !== "bulk_create") return {};
  return {
    afterTool: (cp, call, out) => {
      if (call.function.name !== "create_draft_entry" || !out.ok || !out.data?.uid || !out.data?.id) return;
      const item = tickPlanForCreate(cp.plan, String(out.data.uid), String(out.data.id));
      return item ? [{ type: "plan_item", id: item.id, status: item.status, result: item.result }] : undefined;
    },
    checkPlan: (cp) =>
      cp.plan ? verifyBulkCreate(cp.plan, cp.ledger.applied).map((i): AgentEvent => ({ type: "plan_item", id: i.id, status: i.status, note: i.note })) : undefined,
  };
}

/** One item of a direct template job, as the job's owner. */
async function runDirectItem(job: AgentJobRow, owner: JobOwner, item: DirectItem): Promise<DirectResult> {
  const ctx = runContext(job, owner);
  const p = job.params || {};
  if (job.template === "audit_all") {
    const r = await executeTool(ctx, "audit_entry", JSON.stringify({ uid: item.uid, id: item.id }));
    const findings = r.ok && Array.isArray(r.data)
      ? r.data.map((f: any) => ({ dimension: String(f.dimension), severity: SEVERITY[f.severity] || String(f.severity), message: String(f.message) }))
      : undefined;
    return { ...item, ok: r.ok, summary: r.summary, findings };
  }
  // bulk_translate: an entry with a translation into this language already waiting in review is left alone.
  const inReview = await governed.list<any>(REVIEW_UID, {
    pageSize: 50,
    filter: [{ field: "documentRef", op: "eq", value: item.id }, { field: "kind", op: "eq", value: "translation" }, { field: "stage", op: "eq", value: "in_review" }],
  }).catch(() => null);
  if (inReview?.data.some((r) => r?.payload?.targetLocale === p.targetLocale)) {
    return { ...item, ok: true, skipped: true, summary: "Skipped: a translation is already waiting in review." };
  }
  const args = { uid: item.uid, id: item.id, targetLocale: p.targetLocale, ...(p.sourceLocale ? { sourceLocale: p.sourceLocale } : {}) };
  const r = await executeTool(ctx, "translate_fields", JSON.stringify(args));
  return { ...item, ok: r.ok, summary: r.summary };
}

const every = (ms: number, fn: () => void) => {
  const t = setInterval(fn, ms);
  t.unref?.();
  return () => clearInterval(t);
};

class AgentWorker {
  readonly id = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  stopping = false;
  private readonly active = new Map<string, Promise<void>>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private readonly deps: RunnerDeps = {
    store: strapiJobStore,
    clock: realClock,
    limits: limitsFor("job", { maxTurns: SLICE_TURNS }),
    asOwner: (job, fn) => runAsJobOwner(job, fn),
    engineDeps: (job, owner) => {
      const ctx = runContext(job, owner);
      return {
        chat,
        systemPrompt: () => jobSystemPrompt(ctx, { onQuestion: job.onQuestion ?? "wait", planLocked: Array.isArray(job.params?.plan) }),
        tools: {
          specs: () => toolSpecs(ctx),
          isWrite: toolIsWrite,
          execute: (call) => executeTool(ctx, call.function.name, call.function.arguments),
        },
        ...templateHooks(job),
      };
    },
    every,
    shouldYield: () => this.stopping,
  };
  private readonly direct: DirectDeps = {
    store: strapiJobStore,
    clock: realClock,
    asOwner: (job, fn) => runAsJobOwner(job, fn),
    runItem: runDirectItem,
    every,
    shouldYield: () => this.stopping,
  };

  start(): void {
    this.schedule(1_000);
    // Docker stop: finish the current turn of each job and requeue it. (Not
    // SIGINT: a listener there would keep Ctrl+C from stopping a dev server.)
    process.once("SIGTERM", () => void this.stop());
  }

  kick(): void {
    if (!this.stopping) this.schedule(0);
  }

  status() {
    return { id: this.id, running: this.active.size, concurrency: CONCURRENCY, stopping: this.stopping };
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    // Slices stop at their next turn or item (shouldYield) and requeue; leases
    // of any still running after the grace period expire and are reclaimed.
    await Promise.race([Promise.allSettled([...this.active.values()]), new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS))]);
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms + Math.floor(Math.random() * 500));
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (this.stopping || this.ticking) return;
    this.ticking = true;
    try {
      const free = CONCURRENCY - this.active.size;
      if (free > 0) {
        const { caps, defaultCap } = await agentJobCaps();
        for (const job of await claimJobs(this.id, free, caps, defaultCap)) this.launch(job);
      }
    } catch (e) {
      console.error("[agent-worker] claim failed:", (e as Error)?.message || e);
    } finally {
      this.ticking = false;
      if (!this.stopping) this.schedule(POLL_MS);
    }
  }

  private launch(job: AgentJobRow): void {
    const direct = isTemplateKey(job.template) && TEMPLATES[job.template].strategy === "direct";
    const slice: Promise<SliceOutcome> = direct ? runDirectJobSlice(job, this.direct) : runJobSlice(job, this.deps);
    const run = slice
      .then((outcome) => {
        if (outcome.state === "queued") this.kick();
      })
      .catch((e) => {
        // The lease is left to expire; the job is reclaimed with backoff.
        console.error(`[agent-worker] job ${job.documentId} slice failed:`, (e as Error)?.message || e);
      })
      .finally(() => {
        this.active.delete(job.documentId);
      });
    this.active.set(job.documentId, run);
  }
}

const holder = globalThis as typeof globalThis & { __webxAgentWorker?: AgentWorker };

/** Starts this process's worker once (hot reloads keep the same one). Null when AGENT_WORKER_ENABLED=0. */
export function ensureWorkerStarted(): AgentWorker | null {
  if (process.env.AGENT_WORKER_ENABLED === "0") return null;
  if (!holder.__webxAgentWorker) {
    holder.__webxAgentWorker = new AgentWorker();
    holder.__webxAgentWorker.start();
  }
  return holder.__webxAgentWorker;
}

/** Wakes the worker to claim now (after a job is created, resumed or answered). */
export function kickWorker(): void {
  ensureWorkerStarted()?.kick();
}

export function workerStatus() {
  return holder.__webxAgentWorker?.status() ?? null;
}
