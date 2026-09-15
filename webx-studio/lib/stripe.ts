// One Stripe client, server-only — every billing route imports this instead
// of constructing its own, same convention lib/llm.ts uses for the AI
// gateway client. STRIPE_SECRET_KEY unset means billing is disabled (the
// checkout route's own 503 branch already handles that); callers here can
// assume it's set once they've imported this successfully in a code path
// gated the same way.
import "server-only";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "./config";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) client = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });
  return client;
}

export const billingConfigured = (): boolean => Boolean(STRIPE_SECRET_KEY);
