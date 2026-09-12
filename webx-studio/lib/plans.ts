// Plan limits — single source for the billing display and usage-metering
// enforcement. Keep in sync with the tiers shown on the Plans & Billing page.
// agentRuns: WebX Agent runs per calendar month (see lib/cms/governance.ts's
// enforceAgentRunLimit) — Free gets 0 (the agent is Pro+ only, matching
// Billing.tsx's bf.ai/bf.rag feature labels), Pro a real but bounded budget,
// Enterprise unlimited like everything else at that tier.
// agent*Jobs/agentSchedules/agentJob*: background jobs (Phase 9) — how many run
// at once and wait in the queue per workspace, how many schedules it may keep,
// and each job's token and minute budget. Placeholder product numbers.
export type PlanLimits = {
  items: number;
  seats: number;
  agentRuns: number;
  agentConcurrentJobs: number;
  agentQueuedJobs: number;
  agentSchedules: number;
  agentJobTokenBudget: number;
  agentJobMaxMinutes: number;
  agentMonthlyJobTokens: number;
};

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    items: 50, seats: 1, agentRuns: 0,
    agentConcurrentJobs: 0, agentQueuedJobs: 0, agentSchedules: 0, agentJobTokenBudget: 0, agentJobMaxMinutes: 0, agentMonthlyJobTokens: 0,
  },
  pro: {
    items: 1000, seats: 5, agentRuns: 300,
    agentConcurrentJobs: 2, agentQueuedJobs: 20, agentSchedules: 5, agentJobTokenBudget: 500_000, agentJobMaxMinutes: 60, agentMonthlyJobTokens: 10_000_000,
  },
  enterprise: {
    items: Infinity, seats: Infinity, agentRuns: Infinity,
    agentConcurrentJobs: 8, agentQueuedJobs: 200, agentSchedules: 50, agentJobTokenBudget: 2_000_000, agentJobMaxMinutes: 240, agentMonthlyJobTokens: Infinity,
  },
};
export const planLimit = (plan?: string) => PLAN_LIMITS[plan || "free"] || PLAN_LIMITS.free;

/** true if adding one more user would exceed (or already has exceeded) the
 * plan's seat cap — governance.ts's users.create() throws off this.
 *
 * Extracted into this dependency-free module specifically so it's testable
 * on its own (M15, 2026-09-12 audit finding): users.create() itself calls
 * requireUser(), which reads Next's cookies() and throws outside a real
 * request scope, so nothing that goes through it can run in a plain unit
 * test without a session-mocking harness this test suite doesn't have yet.
 * The enforcement DECISION doesn't need any of that context, though — just
 * a plan name and a seat count — so pulling it out here gets real coverage
 * on the part that was actually untested, without needing to build (or
 * fake) that harness. */
export function seatLimitExceeded(plan: string | undefined, currentSeats: number): boolean {
  const limit = planLimit(plan).seats;
  return Number.isFinite(limit) && currentSeats >= limit;
}
