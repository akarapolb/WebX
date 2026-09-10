// Durable background jobs (Phase 9, M4). A job is an agent run stored in
// Strapi (api::agent-job.agent-job) and executed by the worker in slices, each
// under a lease, as the job's owner. These types are shared by the pure slice
// runner (runner.ts), the owner check (owner.ts), the Strapi-backed store and
// the jobs API.
import type { CurrentUser } from "@/lib/cms/types";
import type { AgentEvent, AgentLevel, PlanItem } from "../types";

export type JobRunState = "queued" | "running" | "done" | "failed" | "cancelled" | "paused";
export type JobOutcome = "completed" | "incomplete" | "partial_budget" | "partial_stuck";
export type OwnerRefusal = "owner_revoked" | "policy_changed" | "plan";

/** The part of governance.ts's AgentPolicy a job needs; kept here so the runner stays free of server imports. */
export type JobPolicy = {
  level: AgentLevel;
  tools: string[] | null;
  contentTypes: string[] | null;
  model: string;
  dialect: string;
  engine: "strapi" | "wordpress";
  tenantKey: string | null;
};

export type AgentJobRow = {
  documentId: string;
  tenantKey: string;
  ownerEmail: string;
  /** The owner's account id when the job was created; a different id later means a different person. */
  ownerUserId: string;
  engine: "strapi" | "wordpress";
  threadId?: string | null;
  scheduleId?: string | null;
  template?: string | null;
  title: string;
  goal: string;
  params?: Record<string, any> | null;
  lang?: "en" | "th";
  requiredLevel: AgentLevel;
  policySnapshot?: JobPolicy | null;
  onQuestion?: "wait" | "auto";
  runState: JobRunState;
  outcome?: JobOutcome | null;
  stateReason?: string | null;
  notBefore?: string | null;
  attempts: number;
  leaseToken?: string | null;
  checkpointSeq: number;
  eventSeq?: number;
  checkpoint?: unknown;
  pendingAnswer?: string | null;
  budget?: { maxTokens?: number; maxMinutes?: number } | null;
  tokensUsed: number;
  progress?: JobProgress | null;
  result?: Record<string, any> | null;
  cancelRequestedAt?: string | null;
  pauseRequestedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastError?: string | null;
};

export type JobEvent = AgentEvent & { seq: number; at: string };

export type JobProgress = {
  turns: number;
  toolCalls: number;
  tokens: number;
  applied: number;
  proposals: number;
  plan: PlanItem[] | null;
  question: { question: string; options: string[] } | null;
  lastStop: string | null;
};

export type JobFinish = {
  runState: Exclude<JobRunState, "running">;
  outcome?: JobOutcome;
  stateReason?: string;
  notBefore?: string | null;
  lastError?: string;
};

export type JobOwner = { user: CurrentUser; policy: JobPolicy; lang: "en" | "th" };

export type CheckpointPatch = {
  at: "turn" | "pre_write" | "stop";
  checkpoint: unknown;
  checkpointSeq: number;
  eventSeq: number;
  events: JobEvent[];
  progress: JobProgress;
  tokensUsed: number;
  clearAnswer?: boolean;
};

export type FinishPatch = JobFinish & {
  checkpoint?: unknown;
  checkpointSeq?: number;
  eventSeq: number;
  events: JobEvent[];
  progress?: JobProgress;
  tokensUsed?: number;
  result?: Record<string, any>;
};

/** Every write is conditional on the lease token: `false` means another worker holds the job now. */
export interface JobStore {
  heartbeat(id: string, leaseToken: string): Promise<{ ok: boolean; cancelRequested?: boolean; pauseRequested?: boolean }>;
  checkpoint(id: string, leaseToken: string, patch: CheckpointPatch): Promise<boolean>;
  finish(id: string, leaseToken: string, patch: FinishPatch): Promise<boolean>;
}
