# WebX — handoff for next session

**As of:** 2026-09-15 · `main` @ `a080ab2`. **Working tree:** clean —
everything below is committed and pushed.

This session covered two independent pieces of work: (1) real multi-language
(Thai/English) support for Visual Builder pages, and (2) a real Stripe
recurring-billing integration for the Pro plan. Both are described in full
below, in the order they landed.

---

## 1. Multi-language Visual Builder pages — `b4eabd2`, `8d36d6a`, `1ceec77`

Visual Builder pages (`api::page.page`/`api::landing.landing` for the Strapi
tenants DGA/PEA/NBTC/ThaID; `wp:page` for the WordPress tenants
orst/royalsociety) were single-language by construction before this. Plan
file (if still present): `C:\Users\akarapol\.claude\plans\fancy-soaring-marshmallow.md`
(now holds the Stripe plan — the i18n plan's content was overwritten once
that task finished; nothing lost, both are captured in commit messages).

### Track A — Strapi tenants: done and live-verified end-to-end
- Schema: `Page`/`Landing` now have real Strapi i18n enabled, mirroring
  `Article`'s exact per-attribute pattern (`title`/`slug`/`seoDescription`/
  `blocks` localized, `tenant` explicitly NOT — a relation left unmarked
  defaults to independently localizable under i18n, which would drop the
  tenant link off a new locale row).
- **A real permission bug was found and fixed as part of this**: enabling
  i18n on a content type resets/creates its admin-role CM permissions —
  `strapi-cms/src/seed/seed.ts`'s `grantLocalesToEditorRoles`/
  `ensureEditorPublishPermissions`/`ensurePageBuilderEditorPermissions` all
  needed `api::page.page`/`api::landing.landing` added to their subject
  lists, or an i18n-enabled subject's permission with no `locales` key
  means an EMPTY allow-list (deny all) — this locked `dga-editor` out of
  Page/Landing **entirely** (not just English) the first time it was
  tested live. Fixed; re-verified live afterward.
- `webx-studio/components/VisualBuilder.tsx` gained a **TH | EN toggle**
  next to the page picker. A Strapi page's missing locale shows an explicit
  "no English version yet" state + a one-click "Create English version"
  button (Strapi returns 200 with an empty body for this case, not 404 —
  confirmed by reading `@strapi/content-manager`'s own controller source).
  WordPress's "other locale" is a sibling `blocks_en` field on the SAME
  entry (already existed, orphaned — `wordpress.ts` now registers it) —
  same UI toggle, different mechanism per engine.
- `lib/agent/tools.ts`'s `translate_fields` now walks a page's `blocks[]`
  (headings/body/CTA labels), not just the flat `title` field it was
  limited to before — it was translating almost nothing for Page/Landing.
- **Live-verified**: created a real English locale for a test page,
  confirmed two independent DB rows (same `documentId`, `locale: 'th'` and
  `locale: 'en'`), then had the Agent build the English hero — it correctly
  read 0 blocks for the `en` locale (not the Thai content) and inserted a
  real, independent English section. Test content cleaned up afterward.

### Track B — WordPress tenants: code-complete, **not live-tested**
`wordpress.ts` now exposes the already-existing `blocks_en` ACF field as a
normal second top-level field; `VisualBuilder.tsx`'s same toggle switches
between `blocks`/`blocks_en` on the same entry for a WP session. No
WordPress instance exists in this dev environment (not in
`.claude/launch.json`, needs a PHP/MySQL runtime this sandbox doesn't have)
— this is typechecked and follows the exact plan, but has never been
clicked through live. **First thing to verify once a WP environment is
available.**

---

## 2. Stripe billing — `756c355`, `8053166`, `a080ab2`

Pro ($79/mo) is now a real, chargeable subscription. Enterprise stays
sales-assisted (no Stripe Checkout for it at all — a workspace admin sets
`plan: "enterprise"` by hand, from an unscoped/Super Admin session).

### A real pre-existing security bug, found and fixed first (`756c355`)
`assertBookkeepingWriteAllowed`'s `TENANT_UID` branch
(`webx-studio/lib/cms/governance.ts`) only ever checked that a write
targeted the caller's own tenant row — never *which fields*. Any
authenticated tenant admin could already `PUT` their own tenant with
`{"plan":"enterprise","seats":999}` and have it silently succeed, **before
Stripe was ever involved**. `lockedTenantFields()` (pure, exported, unit
tested — 4 new tests) now rejects
`plan`/`subscriptionStatus`/`seats`/`stripeCustomerId`/
`stripeSubscriptionId`/`stripePriceId` from any scoped caller's write,
unconditional of field-policy config. **Verified live**: logged in as
`dga-editor`, confirmed the exploit now 403s, confirmed an ordinary field
edit still works.

### Checkout + webhook + state machine (`8053166`)
- `Tenant` schema gains `stripeCustomerId`/`stripeSubscriptionId`/
  `stripePriceId` (`private: true` — hides them from Strapi's *public*
  Content API only; the content-manager admin API this app actually uses
  ignores `private`, so the field-write guard above is the real
  protection, not this flag).
- New `stripe-webhook-event` content type — a real unique-constraint-backed
  idempotency ledger (not an in-memory set, survives a restart / multiple
  instances).
- `app/api/billing/checkout/route.ts` — the existing stub (used to 501
  deliberately) now creates a real Stripe Checkout Session.
- `app/api/webhooks/stripe/route.ts` (new) — the first route in this
  codebase reading a raw body before any JSON parsing (`stripe.webhooks.
  constructEvent` needs the exact raw bytes). Handles
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`,
  `invoice.paid`, `checkout.session.expired`. `subscription.status` is the
  single source of truth for `tenant.subscriptionStatus`; only
  `subscription.deleted` or a `canceled`/`unpaid` status ever flips `plan`
  back to `"free"` — `invoice.*` events never touch `plan`, only status
  (Stripe redelivers/reorders events; this stops a stale `invoice.paid`
  from resurrecting a tenant a newer cancellation already downgraded).
  `past_due` deliberately keeps Pro-tier enforcement (a grace period) —
  `lib/plans.ts`'s limits key exclusively off `plan`, never
  `subscriptionStatus`.
- `governance.ts` gained `applyStripeWebhookUpdate`/`claimStripeEvent`/
  `markStripeEventResolved` — all deliberately **bypass** `governed.update`
  entirely (same reason the signup flow bypasses `governed.create`):
  system-initiated writes with no caller to gate. Routing them through
  `governed.update` would hit the field-write guard above, which exists
  specifically to block a *caller* from touching these exact fields.
- **A second real bug, introduced this session and caught during the same
  live test**: `middleware.ts` redirects any session-less request to
  `/login` — and Stripe's servers carry no session at all. Without the
  fix, every real webhook delivery would have silently 302'd to the login
  page's HTML instead of ever reaching the handler, and no subscription
  state would ever update after checkout. Fixed (`/api/webhooks` now
  exempt, same as `/api/internal`) and reverified.
- **Live-verified** using Stripe's own `generateTestHeaderString` helper —
  a genuinely-signed test event, no real Stripe account needed for this
  part: `customer.subscription.updated` (status `past_due`) correctly kept
  the tenant on Pro but flipped status; redelivering the identical
  `event.id` correctly no-op'd (`{"ok":true,"duplicate":true}`);
  `customer.subscription.deleted` correctly downgraded to `free`/
  `canceled`. Tenant restored to its real original state afterward, test
  ledger rows deleted.

### Custom billing UI (`a080ab2`)
`Billing.tsx` gained an Invoices table, a Stripe Elements payment-method
form (card data tokenized client-side, never touches this server), and
cancel-at-period-end with undo — a custom UI, not Stripe's hosted Customer
Portal, per product decision. Five new routes under `app/api/billing/`
(`invoices`, `setup-intent`, `payment-method`, `cancel`, `subscription`),
all resolving the tenant server-side from the caller's own session — never
a client-supplied `stripeCustomerId`. Verified each returns a graceful
empty/disabled response with Stripe unconfigured (current real state).

### What's still needed before this can actually take a real payment
Four env vars, none set anywhere real yet: `STRIPE_SECRET_KEY`,
`STRIPE_PRICE_ID_PRO`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET` (the last one only exists once a webhook endpoint
is configured in the Stripe Dashboard pointed at a real deployed domain —
documented in `DEPLOY.md`'s new "Billing (Stripe)" section, including the
`/api/webhooks` middleware-exemption gotcha for whoever touches
`middleware.ts` next).

### In progress when this session ended — picks up here next time
The user confirmed they have real Stripe **test-mode** keys ready to hand
over (via the same Notepad/`.env.local` workflow used for the Kimi key
earlier), specifically to run a genuine end-to-end simulation: real
Checkout with a Stripe test card, real webhook delivery, recurring-billing
event triggers, cancellation — all in Stripe's test mode, no real money.

**The blocker Stripe CLI solves**: `/api/webhooks/stripe` needs a public
HTTPS URL for Stripe's real servers to call — which this sandbox doesn't
have. `stripe listen` sidesteps that entirely (it connects *outbound* from
the CLI to Stripe, no inbound tunnel needed) and was confirmed working
this session: the official `@stripe/cli` npm wrapper installs a real
platform binary (`stripe version` → `1.50.11`), installed into a scratch
npm project (not part of the repo — reinstall if a fresh session needs it
again: `npm install @stripe/cli` in a scratch dir, or `npm view @stripe/cli`
to confirm it's still current).

**Next-session plan once the keys arrive**:
1. Put the real **test-mode** `sk_test_...`/`pk_test_...`/`price_...` into
   `webx-studio/.env.local` (Notepad, not chat) and restart webx-studio.
2. `stripe listen --forward-to http://localhost:3001/api/webhooks/stripe
   --api-key sk_test_...` (background) — note the `whsec_...` it prints,
   set that as `STRIPE_WEBHOOK_SECRET` too, restart again.
3. Real onboarding: trigger checkout from `/billing`, complete it in the
   Browser pane with Stripe's test card (4242 4242 4242 4242, any future
   expiry/CVC), confirm the CLI relays `checkout.session.completed` and the
   tenant really gets `stripeCustomerId`/`stripeSubscriptionId`/`plan:"pro"`.
4. Recurring billing: `stripe trigger invoice.payment_failed`,
   `stripe trigger customer.subscription.updated`, etc. — these create real
   (test-mode) Stripe objects and fire real events, the closest thing to
   actually simulating a billing cycle without waiting for one.
5. Exercise the UI live: Invoices table populates from the real test
   customer, Payment-method update via Elements, Cancel/Resume.
6. Revert `.env.local` to blank and clean up any test tenant state
   afterward, same discipline as this session's own local verification.

---

## 3. Suggested order for next session

1. **Stripe test-mode simulation** (above) — the explicit, already-agreed
   next step, just waiting on the user to hand over keys.
2. **WordPress Track B verification** (i18n) — first real WP environment
   this repo gets access to, click through the TH/EN toggle on an
   orst/royalsociety page.
3. Two known, deliberately-deferred gaps, neither blocking anything:
   - `app/api/ai/translate/route.ts` (a separate, human-facing "AI
     Translate" button) has the same "can't see a page's `blocks[]`" gap
     `translate_fields` had before this session's fix — never touched,
     different code path.
   - The Sep 12 full-audit's 14 open High-severity items (see
     `WebX-audit-2026-09-12.md`) — untouched this session, still open.

---

*Generated by Claude (Sonnet 5) at the end of the 2026-09-15 session. Also
saved to this machine's persistent memory
(`~/.claude/projects/D--Claude-WebX/memory/`) so a fresh session has the
durable facts even without this file.*
