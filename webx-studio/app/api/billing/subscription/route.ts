// Subscription-level detail Billing.tsx needs that isn't on the tenant
// record itself (cancel_at_period_end / the renewal date) — plan and
// subscriptionStatus already come from the tenant entry directly, so this
// stays a small, separate lookup rather than duplicating those onto the
// tenant row too.
import { NextResponse } from "next/server";
import { requireUser, resolveEffectiveTenant } from "@/lib/cms/governance";
import { stripe, billingConfigured } from "@/lib/stripe";

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!billingConfigured()) return NextResponse.json({ subscription: null });

  const eff = await resolveEffectiveTenant(user.email);
  if (!eff?.stripeSubscriptionId) return NextResponse.json({ subscription: null });

  try {
    const sub = await stripe().subscriptions.retrieve(eff.stripeSubscriptionId);
    return NextResponse.json({
      subscription: {
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      },
    });
  } catch (e) {
    console.error("[billing] subscription lookup failed:", e);
    return NextResponse.json({ subscription: null });
  }
}
