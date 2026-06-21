// Plan limits — single source for the billing display and usage-metering
// enforcement. Keep in sync with the tiers shown on the Plans & Billing page.
export const PLAN_LIMITS: Record<string, { items: number; seats: number }> = {
  free: { items: 50, seats: 1 },
  pro: { items: 1000, seats: 5 },
  enterprise: { items: Infinity, seats: Infinity },
};
export const planLimit = (plan?: string) => PLAN_LIMITS[plan || "free"] || PLAN_LIMITS.free;
