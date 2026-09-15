// Billing checkout — creates a real Stripe Checkout Session for the Pro
// plan. Enterprise has no self-serve checkout (sales-assisted only, per
// product decision) — this route only ever accepts "pro". Degrades to 503
// when Stripe isn't configured, same as before this was implemented.
//
// Deliberately writes NOTHING to the tenant here — checkout only redirects
// the caller to Stripe; the actual plan/subscription state is set by
// /api/webhooks/stripe's checkout.session.completed handler once payment
// really succeeds. This route can't be tricked into "upgrading" a tenant on
// its own (there is no write path here for that at all).
import { NextRequest, NextResponse } from "next/server";
import { requireUser, resolveEffectiveTenant } from "@/lib/cms/governance";
import { stripe, billingConfigured } from "@/lib/stripe";
import { STRIPE_PRICE_ID_PRO } from "@/lib/config";

export async function POST(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { plan } = await req.json().catch(() => ({} as any));
  // Enterprise is intentionally excluded here — "Contact us" in Billing.tsx
  // never calls this route for it; a client that tried anyway gets the same
  // clean 400 an invalid plan string would.
  if (plan !== "pro") return NextResponse.json({ error: "valid plan required" }, { status: 400 });

  if (!billingConfigured() || !STRIPE_PRICE_ID_PRO) {
    return NextResponse.json({ error: "Billing is not configured", configured: false }, { status: 503 });
  }

  const eff = await resolveEffectiveTenant(user.email);
  if (!eff) return NextResponse.json({ error: "No workspace to bill — sign in as a workspace admin." }, { status: 403 });

  const origin = req.nextUrl.origin;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_ID_PRO, quantity: 1 }],
      // Reuse the tenant's existing Stripe customer if this is a
      // resubscribe after a prior cancellation — avoids a duplicate
      // customer object and its own separate invoice history.
      customer: eff.stripeCustomerId || undefined,
      customer_email: eff.stripeCustomerId ? undefined : (user.email || undefined),
      // Set on BOTH: the Session's own metadata (checkout.session.completed's
      // event payload IS the Session) and subscription_data.metadata (Stripe
      // copies this onto the Subscription it creates, so every later
      // customer.subscription.* event carries tenantKey too, no DB lookup
      // needed to resolve which tenant an event is for).
      metadata: { tenantKey: eff.key },
      subscription_data: { metadata: { tenantKey: eff.key } },
      success_url: origin + "/billing?checkout=success",
      cancel_url: origin + "/billing?checkout=cancel",
    });
    if (!session.url) return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[billing] checkout session creation failed:", e);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
  }
}
