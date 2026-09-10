// The in-process background job worker: one per webx process, started from
// instrumentation.ts, with the tick route as a liveness backstop. Several
// processes can run workers at once because claiming is a compare-and-set in
// Strapi. Each claimed job runs one slice (jobs/runner.ts) and goes back to
// the queue, so a long job doesn't hold a slot and tenants take turns.
import "server-only";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { agentJobCaps, runAsJobOwner } from "@/lib/cms/governance";
import { chat } from "@/lib/llm";
import { realClock } from "./engine/deps.server";
import { limitsFor } from "./engine/limits";
import { runJobSlice, type RunnerDeps } from "./jobs/runner";
import { claimJobs, strapiJobStore } from "./jobs/store.server";
import type { AgentJobRow, JobOwner } from "./jobs/types";
import { jobSystemPrompt } from "./prompts";
import { executeTool, toolIsWrite, toolSpecs } from "./tools";
import type { AgentRunContext } from "./types";

const POLL_MS = 5_000;
const CONCURRENCY = Math.max(1, Number(process.env.AGENT_WORKER_CONCURRENCY) || 3);
const SLICE_TURNS = Math.max(1, Number(process.env.AGENT_SLICE_TURNS) || 8);
const SHUTDOWN_GRACE_MS = 20_000;

function runContext(job: AgentJobRow, owner: JobOwner): AgentRunContext {
  return {
    user: owner.user, tenantKey: job.tenantKey, level: owner.policy.level,
    allowedTools: owner.policy.tools, allowedContentTypes: owner.policy.contentTypes,
    model: owner.policy.model, runId: job.documentId, threadId: job.threadId || "", lang: job.lang ?? owner.lang,
    ref: { kind: "none" }, dialect: owner.policy.dialect, engine: owner.policy.engine,
  };
}

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
        systemPrompt: () => jobSystemPrompt(ctx, { onQuestion: job.onQuestion ?? "wait" }),
        tools: {
          specs: () => toolSpecs(ctx),
          isWrite: toolIsWrite,
          execute: (call) => executeTool(ctx, call.function.name, call.function.arguments),
        },
      };
    },
    every: (ms, fn) => {
      const t = setInterval(fn, ms);
      t.unref?.();
      return () => clearInterval(t);
    },
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
    // Slices stop at their next turn (shouldYield) and requeue; leases of any
    // still running after the grace period expire and are reclaimed.
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
    const run = runJobSlice(job, this.deps)
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
