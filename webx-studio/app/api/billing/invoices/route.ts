// Custom billing UI's invoice list — Billing.tsx renders this instead of
// linking out to Stripe's hosted Customer Portal (product decision). Never
// forwards the raw Stripe Invoice object: only the fields the UI actually
// needs, and the tenant is resolved server-side from the caller's own
// session — the client can never ask for another tenant's invoices by
// passing a stripeCustomerId itself, because it's never given the chance to.
import { NextResponse } from "next/server";
import { requireUser, resolveEffectiveTenant } from "@/lib/cms/governance";
import { stripe, billingConfigured } from "@/lib/stripe";

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!billingConfigured()) return NextResponse.json({ invoices: [] });

  const eff = await resolveEffectiveTenant(user.email);
  if (!eff?.stripeCustomerId) return NextResponse.json({ invoices: [] });

  try {
    const list = await stripe().invoices.list({ customer: eff.stripeCustomerId, limit: 24 });
    const invoices = list.data.map((inv) => ({
      id: inv.id,
      amount: inv.amount_paid ?? inv.amount_due,
      currency: inv.currency,
      status: inv.status,
      date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
      pdfUrl: inv.invoice_pdf || null,
    }));
    return NextResponse.json({ invoices });
  } catch (e) {
    console.error("[billing] invoices list failed:", e);
    return NextResponse.json({ error: "Could not load invoices" }, { status: 502 });
  }
}
