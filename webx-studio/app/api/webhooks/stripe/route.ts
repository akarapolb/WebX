// Stripe's inbound webhook — the ONLY place a tenant's plan/subscriptionStatus
// actually changes after checkout. First route in this codebase reading a
// raw body before any JSON parsing: stripe.webhooks.constructEvent needs the
// exact raw bytes to verify the signature, so this must never call
// req.json() (which would re-serialize and break verification irrecoverably).
//
// subscription.status is the single source of truth for tenant.subscriptionStatus
// — invoice.* events only ever move it in the direction their name implies
// and never touch plan, and only subscription.deleted/a canceled status ever
// flips plan back to "free". Stripe redelivers and can reorder events; this
// ordering rule is what stops a stale, out-of-order invoice.paid from
// resurrecting a tenant a newer cancellation already downgraded.
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, billingConfigured } from "@/lib/stripe";
import { STRIPE_WEBHOOK_SECRET } from "@/lib/config";
import { applyStripeWebhookUpdate, claimStripeEvent, markStripeEventResolved, type StripeTenantFields } from "@/lib/cms/governance";

function tenantKeyOf(obj: { metadata?: Stripe.Metadata | null }): string | undefined {
  return obj.metadata?.tenantKey || undefined;
}

async function resolveAndApply(by: { tenantKey?: string; stripeCustomerId?: string }, fields: StripeTenantFields, eventId: string) {
  const target = await applyStripeWebhookUpdate(by, fields);
  if (target) await markStripeEventResolved(eventId);
  return target;
}

export async function POST(req: NextRequest) {
  if (!billingConfigured() || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  // MUST read the raw body before any parsing — see module comment.
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e: any) {
    console.error("[billing] webhook signature verification failed:", e?.message);
    return NextResponse.json({ error: "signature verification failed" }, { status: 400 });
  }

  // Idempotency: Stripe redelivers events, sometimes more than once for the
  // same one. A false return here means "already processed" — respond 200
  // without repeating any tenant write.
  let firstTime: boolean;
  try {
    firstTime = await claimStripeEvent(event.id, event.type);
  } catch (e) {
    console.error("[billing] could not record webhook event (not a duplicate — a real failure):", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 }); // let Stripe retry
  }
  if (!firstTime) return NextResponse.json({ ok: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantKey = tenantKeyOf(session);
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (tenantKey && customerId && subscriptionId) {
          // The Price id isn't on the Session itself — read it off the
          // Subscription Stripe just created rather than a second API call
          // shape guess.
          const sub = await stripe().subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price?.id;
          await resolveAndApply({ tenantKey }, {
            stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId,
            plan: "pro", subscriptionStatus: "active", ...(priceId ? { stripePriceId: priceId } : {}),
          }, event.id);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const tenantKey = tenantKeyOf(sub);
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const downgrade = sub.status === "canceled" || sub.status === "unpaid";
        await resolveAndApply({ tenantKey, stripeCustomerId: customerId },
          { subscriptionStatus: sub.status, ...(downgrade ? { plan: "free" } : {}) }, event.id);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const tenantKey = tenantKeyOf(sub);
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await resolveAndApply({ tenantKey, stripeCustomerId: customerId }, { plan: "free", subscriptionStatus: "canceled" }, event.id);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) await resolveAndApply({ stripeCustomerId: customerId }, { subscriptionStatus: "past_due" }, event.id);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) await resolveAndApply({ stripeCustomerId: customerId }, { subscriptionStatus: "active", plan: "pro" }, event.id);
        break;
      }
      case "checkout.session.expired":
        // Abandoned checkout — nothing to undo (nothing was ever set), kept
        // as a claimed no-op event purely for the event.id dedupe ledger.
        break;
      default:
        break; // any other event type: claimed (so it won't reprocess if Stripe redelivers it) but no handler needed
    }
  } catch (e) {
    console.error("[billing] webhook handler failed for " + event.type + ":", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 }); // let Stripe retry
  }

  return NextResponse.json({ ok: true });
}
