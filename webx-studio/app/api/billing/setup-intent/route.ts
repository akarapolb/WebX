// Custom billing UI's payment-method update — a Stripe SetupIntent backs the
// Elements card form Billing.tsx renders. Card details are tokenized
// client-side by Stripe.js and never touch this server at all; this route
// only ever hands back a clientSecret, never anything card-shaped.
import { NextResponse } from "next/server";
import { requireUser, resolveEffectiveTenant } from "@/lib/cms/governance";
import { stripe, billingConfigured } from "@/lib/stripe";

export async function POST() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!billingConfigured()) return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });

  const eff = await resolveEffectiveTenant(user.email);
  if (!eff?.stripeCustomerId) return NextResponse.json({ error: "No billing account yet — subscribe to Pro first." }, { status: 400 });

  try {
    const intent = await stripe().setupIntents.create({ customer: eff.stripeCustomerId });
    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (e) {
    console.error("[billing] setup intent creation failed:", e);
    return NextResponse.json({ error: "Could not start payment-method update" }, { status: 502 });
  }
}
