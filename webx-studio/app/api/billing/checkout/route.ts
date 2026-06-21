// Billing checkout — auth-gated, provider-agnostic, and SAFE: it never moves
// money in this build. Without a billing provider key it degrades gracefully
// (503), exactly like the LLM gateway. With STRIPE_SECRET_KEY set, this is where
// a Checkout Session would be created — intentionally not called here so no live
// keys are handled and no real charge can occur.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";

const billingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { plan } = await req.json().catch(() => ({} as any));
  if (!plan || !["pro", "enterprise"].includes(plan)) return NextResponse.json({ error: "valid plan required" }, { status: 400 });

  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured", configured: false }, { status: 503 });
  }
  // STRIPE_SECRET_KEY is set: create a Checkout Session and return { url } here.
  // Deliberately left as a stub in this build — no live keys, no real charges.
  return NextResponse.json({ error: "Billing provider integration pending", configured: true }, { status: 501 });
}
