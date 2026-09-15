// Plan limits — single source for the billing display and usage-metering
// enforcement. Keep in sync with the tiers shown on the Plans & Billing page.
// agentRuns: WebX Agent runs per calendar month (see lib/cms/governance.ts's
// enforceAgentRunLimit) — Free gets 0 (the agent is Pro+ only, matching
// Billing.tsx's bf.ai/bf.rag feature labels), Pro a real but bounded budget,
// Enterprise unlimited like everything else at that tier.
// agent*Jobs/agentSchedules/agentJob*: background jobs (Phase 9) — how many run
// at once and wait in the queue per workspace, how many schedules it may keep,
// and each job's token and minute budget. Placeholder product numbers.
//
// 2026-09-14 pricing pass: Pro moved from a flat $59 with a 1,000-item cap to
// $79/site with a fair-use item ceiling and a 2M-token/month AI allowance —
// the old 300-run/10M-token budget let a heavy user's LLM spend exceed their
// $59 (see the margin model worked through with the user; a workspace that
// used its full 10M-token allowance cost more in Sonnet tokens than it paid).
// `items` here is the real enforced ceiling (enforceItemLimit), set high
// enough that no realistic multi-site tenant hits it — "fair use", not the
// number quoted in marketing copy, same relationship Enterprise's own
// Infinity already has to "unlimited" on the pricing page.
// `agentMonthlyJobTokens` is the internal budget behind Pro's "fair usage,
// managed automatically" copy — deliberately not a number quoted on the
// pricing page (same posture Claude's own consumer plans take: a real limit
// exists and is enforced, but the customer-facing copy describes it
// qualitatively rather than in tokens, so the number can be tuned without
// rewriting marketing pages).
//
// Enforcement (2026-09-14, two passes): wired to governance.ts's
// enforceAgentTokenBudget(), called both before a background job is
// created and before a chat run starts — see tokenBudgetExceeded() below
// for the pure decision this checks against a real monthly sum. Two
// sources feed that sum: background jobs' own `tokensUsed`, and — added
// in the second pass, since agent-thread's own `usage` JSON field only
// ever holds the LATEST run's numbers, not a history — a dedicated
// audit-log row per interactive run (recordAgentRunUsage, written once a
// run's real usage is known, the completion-time counterpart to
// recordAgentRunStart). Metered overage billing has no payment integration
// behind it at all; hitting the limit blocks the next job or run (a 403,
// same shape as every other plan-limit check in this codebase), it doesn't
// auto-charge anything.
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
    items: 10_000, seats: 5, agentRuns: 300,
    agentConcurrentJobs: 2, agentQueuedJobs: 20, agentSchedules: 5, agentJobTokenBudget: 500_000, agentJobMaxMinutes: 60, agentMonthlyJobTokens: 2_000_000,
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

/** true if a workspace's AI usage this calendar month has reached (or
 * passed) its plan's monthly token budget — governance.ts's
 * enforceAgentTokenBudget() sums real job rows' tokensUsed and throws off
 * this, same "extract the decision, not the plumbing" reasoning as
 * seatLimitExceeded() above: summing rows needs a live Strapi connection
 * this test suite can't fake, but the decision itself is just two numbers. */
export function tokenBudgetExceeded(plan: string | undefined, tokensUsedThisMonth: number): boolean {
  const limit = planLimit(plan).agentMonthlyJobTokens;
  return Number.isFinite(limit) && tokensUsedThisMonth >= limit;
}

/** Usage as a 0–100 percent of the plan's monthly token budget — the ONLY
 * shape of this number Billing.tsx's API route is allowed to send to the
 * browser (governance.ts's getAgentUsageSummary). Deliberately not "used /
 * limit": a percentage is enough for a workspace to see how close it is,
 * without either number ever reaching a network response a technically
 * curious admin could inspect — and it means PLAN_LIMITS.pro's actual
 * token figure can be retuned later with zero client-side change, the same
 * "real limit, described qualitatively" posture the pricing page's own
 * copy already takes (see this file's top-of-file comment). Callers must
 * check tokenBudgetExceeded's own Number.isFinite(limit) case themselves
 * first — this returns 0 for an unlimited or zero-budget plan rather than
 * a meaningful percentage, since "percent of infinity" and "percent of
 * zero" aren't real answers. */
export function agentUsagePercent(plan: string | undefined, tokensUsedThisMonth: number): number {
  const limit = planLimit(plan).agentMonthlyJobTokens;
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(100, Math.round((tokensUsedThisMonth / limit) * 100));
}
