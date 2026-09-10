// Plan limits — single source for the billing display and usage-metering
// enforcement. Keep in sync with the tiers shown on the Plans & Billing page.
// agentRuns: WebX Agent runs per calendar month (see lib/cms/governance.ts's
// enforceAgentRunLimit) — Free gets 0 (the agent is Pro+ only, matching
// Billing.tsx's bf.ai/bf.rag feature labels), Pro a real but bounded budget,
// Enterprise unlimited like everything else at that tier.
export const PLAN_LIMITS: Record<string, { items: number; seats: number; agentRuns: number }> = {
  free: { items: 50, seats: 1, agentRuns: 0 },
  pro: { items: 1000, seats: 5, agentRuns: 300 },
  enterprise: { items: Infinity, seats: Infinity, agentRuns: Infinity },
};
export const planLimit = (plan?: string) => PLAN_LIMITS[plan || "free"] || PLAN_LIMITS.free;
