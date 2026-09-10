"use client";
// Shared by the jobs list, a job's page and the jobs indicator.
import type { PlanItem } from "@/lib/agent/types";

export type JobProgressView = {
  turns: number; toolCalls: number; tokens: number; applied: number;
  plan: PlanItem[] | null; question: { question: string; options: string[] } | null;
  lastStop?: string | null; done?: number; total?: number;
};

export type JobRow = {
  documentId: string; title: string; goal?: string; template?: string | null; params?: Record<string, any> | null;
  runState: "queued" | "running" | "paused" | "done" | "failed" | "cancelled"; outcome?: string | null; stateReason?: string | null;
  ownerEmail: string; threadId?: string | null; lang?: "en" | "th"; requiredLevel?: string;
  createdAt?: string; updatedAt?: string; startedAt?: string | null; finishedAt?: string | null;
  tokensUsed?: number; budget?: { maxTokens?: number; maxMinutes?: number } | null;
  progress?: JobProgressView | null; result?: Record<string, any> | null; lastError?: string | null;
  cancelRequestedAt?: string | null; pauseRequestedAt?: string | null;
};

export type JobEventView = { seq: number; at: string; type: string; [k: string]: any };

type Tone = "run" | "wait" | "ok" | "bad" | "mute";

export function jobStatus(j: JobRow): { key: string; tone: Tone } {
  switch (j.runState) {
    case "running": return { key: "running", tone: "run" };
    case "queued": return { key: "queued", tone: "run" };
    case "paused": return { key: j.stateReason === "needs_input" ? "waiting" : "paused", tone: "wait" };
    case "done": return j.outcome && j.outcome !== "completed" ? { key: "incomplete", tone: "wait" } : { key: "done", tone: "ok" };
    case "failed": return { key: "failed", tone: "bad" };
    default: return { key: "cancelled", tone: "mute" };
  }
}

export function StatusPill({ job, t }: { job: JobRow; t: (k: string) => string }) {
  const s = jobStatus(job);
  return (
    <span className={"agj-st " + s.tone} data-testid="agent-job-state" data-state={s.key}>
      <i aria-hidden="true" />{t("aj.st_" + s.key)}
    </span>
  );
}

/** Checklist items done, or items handled by a direct template. */
export function progressOf(j: JobRow): { done: number; total: number } | null {
  const p = j.progress;
  if (!p) return null;
  if (p.plan?.length) return { done: p.plan.filter((i) => i.status === "done").length, total: p.plan.length };
  if (typeof p.total === "number" && p.total > 0) return { done: p.done ?? 0, total: p.total };
  return null;
}

export function ProgressBar({ job }: { job: JobRow }) {
  const p = progressOf(job);
  if (!p) return <span className="agj-note">—</span>;
  return (
    <div className="agj-prog" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done}>
      <div className="agj-prog-bar"><i style={{ width: Math.round((p.done / p.total) * 100) + "%" }} /></div>
      <span>{p.done}/{p.total}</span>
    </div>
  );
}

export const isActiveJob = (j: JobRow) => j.runState === "queued" || j.runState === "running";
export const isFinishedJob = (j: JobRow) => j.runState === "done" || j.runState === "failed" || j.runState === "cancelled";

export function fmtWhen(iso?: string | null, lang?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function fmtTime(iso?: string | null, lang?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString(lang === "th" ? "th-TH" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

export const fmtNum = (n: number | undefined | null, lang: string) => (n ?? 0).toLocaleString(lang === "th" ? "th-TH" : "en-US");

/** Fills {name} placeholders in a translated string. */
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Fired when a job is started or changed in this tab, so lists and the indicator refresh at once. */
export const JOBS_CHANGED = "webx:agent-jobs-changed";
export function announceJobsChanged() {
  window.dispatchEvent(new Event(JOBS_CHANGED));
}

export async function readError(r: Response, fallback: string): Promise<string> {
  const j = await r.json().catch(() => null);
  const e = j?.error;
  return (typeof e === "string" && e) || (typeof e?.message === "string" && e.message) || (typeof j?.message === "string" && j.message) || fallback;
}
