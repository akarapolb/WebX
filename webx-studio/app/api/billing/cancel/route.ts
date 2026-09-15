// Cancel-at-period-end, not immediate — avoids a proration/refund policy
// decision this feature doesn't otherwise need to make. `{resume:true}` is
// the undo: trivial to support (one Stripe field flip) and otherwise a
// tenant who clicked Cancel by mistake has no way back short of contacting
// support, for no real benefit.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, resolveEffectiveTenant } from "@/lib/cms/governance";
import { stripe, billingConfigured } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!billingConfigured()) return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });

  const { resume } = await req.json().catch(() => ({} as any));

  const eff = await resolveEffectiveTenant(user.email);
  if (!eff?.stripeSubscriptionId) return NextResponse.json({ error: "No active subscription to cancel." }, { status: 400 });

  try {
    const sub = await stripe().subscriptions.update(eff.stripeSubscriptionId, { cancel_at_period_end: !resume });
    return NextResponse.json({ ok: true, cancelAtPeriodEnd: sub.cancel_at_period_end });
  } catch (e) {
    console.error("[billing] cancel/resume failed:", e);
    return NextResponse.json({ error: "Could not update the subscription" }, { status: 502 });
  }
}
