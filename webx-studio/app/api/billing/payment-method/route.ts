// Called after Stripe Elements confirms a SetupIntent client-side — the
// browser hands back a Stripe PaymentMethod id (pm_...), never raw card
// data, which this route attaches to the tenant's own Stripe customer and
// sets as their default for future invoices.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, resolveEffectiveTenant } from "@/lib/cms/governance";
import { stripe, billingConfigured } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!billingConfigured()) return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });

  const { paymentMethodId } = await req.json().catch(() => ({} as any));
  if (!paymentMethodId || typeof paymentMethodId !== "string") {
    return NextResponse.json({ error: "paymentMethodId required" }, { status: 400 });
  }

  const eff = await resolveEffectiveTenant(user.email);
  if (!eff?.stripeCustomerId) return NextResponse.json({ error: "No billing account yet — subscribe to Pro first." }, { status: 400 });

  try {
    await stripe().paymentMethods.attach(paymentMethodId, { customer: eff.stripeCustomerId });
    await stripe().customers.update(eff.stripeCustomerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[billing] payment method update failed:", e);
    return NextResponse.json({ error: "Could not update payment method" }, { status: 502 });
  }
}
