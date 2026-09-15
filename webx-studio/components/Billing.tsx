"use client";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { cms, CmsError } from "@/lib/cms";

// Direct process.env read (not lib/config.ts, which is server-only and full
// of real secrets) — same pattern RealPreview.tsx/BlockTypeEditor.tsx
// already use for their own NEXT_PUBLIC_* var. Publishable keys are safe to
// ship to the browser by design; loadStripe() called once at module scope
// per Stripe's own guidance, not per-render.
const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

type Invoice = { id: string; amount: number; currency: string; status: string; date: string | null; pdfUrl: string | null };
type SubInfo = { cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null;

type Plan = { id: string; name: string; price: string; items: number; seats: number; features: string[] };
const PLANS: Plan[] = [
  // USD, matching marketing-site/lib/i18n.ts's plans — keep the two in sync.
  // Pro's `items` is Infinity here (display only) even though lib/plans.ts's
  // real enforced ceiling is a finite 10,000 — same "fair use, not a number
  // we publish" relationship Enterprise's own Infinity already has to its
  // real (also Infinity) limit. Neither this array nor PLAN_LIMITS reads
  // from the other; keep both in sync by hand when either changes.
  { id: "free", name: "Free", price: "$0", items: 50, seats: 1, features: ["f.cms", "f.builder", "f.consent", "f.community"] },
  { id: "pro", name: "Pro", price: "$79 / mo", items: Infinity, seats: 5, features: ["f.everyFree", "f.ai", "f.rag", "f.reviews", "f.priority"] },
  { id: "enterprise", name: "Enterprise", price: "Contact us", items: Infinity, seats: Infinity, features: ["f.everyPro", "f.sso", "f.sla", "f.dr", "f.audit"] },
];
const TEN = "api::tenant.tenant";

// /api/agent/usage never sends the raw token used/limit numbers — only a
// status ("unavailable" on Free, "unlimited" on Enterprise, or "metered"
// with a 0-100 percent on Pro) — see governance.ts's getAgentUsageSummary
// for why: the real cap should never reach a network response, and the
// number should be retunable without a client change (same posture the
// pricing page's own "fair usage, managed automatically" copy takes).
type AgentUsage = { status: "unavailable" } | { status: "unlimited" } | { status: "metered"; percentUsed: number };
const AI_USAGE_UNAVAILABLE: AgentUsage = { status: "unavailable" };

/** Rendered only inside <Elements clientSecret=...> (see Billing() below) —
 * useStripe/useElements need that provider. Confirms the SetupIntent
 * client-side (card details never leave the browser except straight to
 * Stripe), then hands the resulting PaymentMethod id — never card data — to
 * our own /api/billing/payment-method to attach it as the customer's
 * default. */
function PaymentMethodForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const stripeApi = useStripe();
  const elements = useElements();
  const { t } = useLang();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stripeApi || !elements) return;
    setSaving(true); setError("");
    try {
      const { error: confirmError, setupIntent } = await stripeApi.confirmSetup({ elements, redirect: "if_required" });
      if (confirmError) { setError(confirmError.message || "Card could not be saved."); return; }
      const paymentMethodId = typeof setupIntent?.payment_method === "string" ? setupIntent.payment_method : setupIntent?.payment_method?.id;
      if (!paymentMethodId) { setError("Card could not be saved."); return; }
      const r = await fetch("/api/billing/payment-method", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentMethodId }) });
      if (!r.ok) { const j = await r.json().catch(() => ({} as any)); setError(j.error || "Card could not be saved."); return; }
      onSaved();
    } catch { setError("Cannot reach the backend."); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 10 }}>
      <PaymentElement />
      {error && <div className="muted" style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button type="submit" className="btn btn--p" disabled={!stripeApi || saving}>{saving ? "…" : t("b.pmSave")}</button>
        <button type="button" className="btn btn--g" onClick={onCancel} disabled={saving}>{t("b.pmCancel")}</button>
      </div>
    </form>
  );
}

export default function Billing() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const [tenant, setTenant] = useState<any>(null);
  const [usage, setUsage] = useState<{ content: number; seats: number; ai: AgentUsage }>({ content: 0, seats: 0, ai: AI_USAGE_UNAVAILABLE });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [subInfo, setSubInfo] = useState<SubInfo>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [pmClientSecret, setPmClientSecret] = useState<string | null>(null);
  const [pmBusy, setPmBusy] = useState(false);
  const key = currentKey && currentKey !== "workspace" ? currentKey : "";

  const load = useCallback(async () => {
    setErr(""); setMsg(null);
    try {
      // /api/agent/usage resolves the caller's own tenant SERVER-SIDE
      // (governance.ts's resolveEffectiveTenant on the session, the same
      // safe mechanism contentUsageFor itself uses internally) rather than
      // trusting a client-supplied key — so unlike the content/seats block
      // below, it works even when `key` hasn't resolved on the client yet.
      // Found live while adding it: a scoped single-tenant editor's session
      // (no workspace SWITCHER, so useTenant()'s currentKey never gets set
      // to anything but "") made content/seats silently show as 0 — a
      // pre-existing gap in the block below, not something this fetch
      // needed to inherit just because it lives on the same page.
      const usagePromise: Promise<AgentUsage> = fetch("/api/agent/usage").then((x) => (x.ok ? x.json() : AI_USAGE_UNAVAILABLE)).catch(() => AI_USAGE_UNAVAILABLE);
      // Same "resolves the caller's own tenant server-side" reasoning as
      // usagePromise above — safe to kick off before the `key` check below,
      // and both routes already return an empty/null shape gracefully when
      // there's no stripeCustomerId/stripeSubscriptionId yet (Free, or Pro
      // with no successful checkout — shouldn't happen, but not fatal).
      const invoicesPromise: Promise<Invoice[]> = fetch("/api/billing/invoices").then((x) => (x.ok ? x.json() : { invoices: [] })).then((j) => j.invoices || []).catch(() => []);
      const subPromise: Promise<SubInfo> = fetch("/api/billing/subscription").then((x) => (x.ok ? x.json() : { subscription: null })).then((j) => j.subscription || null).catch(() => null);
      // no "|| dga" fallback — that silently showed a DIFFERENT real
      // tenant's billing/plan info for any session whose own tenant hasn't
      // resolved yet (found live: an ORST session with no roster match saw
      // DGA's plan/seat data). An empty key legitimately matches nothing,
      // which the existing tn=null / usage=0 fallback below already handles.
      if (!key) {
        const [ai, inv, sub] = await Promise.all([usagePromise, invoicesPromise, subPromise]);
        setTenant(null); setUsage({ content: 0, seats: 0, ai }); setInvoices(inv); setSubInfo(sub);
        return;
      }
      const { data } = await cms.entries.list<any>(TEN, { pageSize: 1, filter: [{ field: "key", op: "eq", value: key }] });
      const tn = data[0] || null;
      setTenant(tn);
      const seats = Array.isArray(tn?.adminEmails) ? tn.adminEmails.length : 0;
      // content-usage (not the raw Strapi proxy) so a WordPress-engine
      // workspace's usage reflects its own content, not just Strapi's.
      const [a, ai, inv, sub] = await Promise.all([
        fetch("/api/cms/content-usage" + (key ? "?tenant=" + encodeURIComponent(key) : "")).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        usagePromise, invoicesPromise, subPromise,
      ]);
      setUsage({ content: a?.contentTotal ?? 0, seats, ai }); setInvoices(inv); setSubInfo(sub);
    } catch (e) {
      if (e instanceof CmsError && e.status === 403) setErr(t("c.noPerm"));
      else if (e instanceof CmsError) setErr("Could not load billing info (HTTP " + e.status + ").");
      else setErr("Cannot reach the backend.");
    }
  }, [key, t]);
  useEffect(() => { load(); }, [load]);

  const planId = tenant?.plan || "free";
  const plan = PLANS.find((p) => p.id === planId) || PLANS[0];
  const pct = (used: number, limit: number) => (limit === Infinity ? 8 : Math.min(100, Math.round((used / limit) * 100)));
  const lim = (n: number) => (n === Infinity ? t("b.unlimited") : n.toLocaleString());

  async function upgrade(target: string) {
    if (target === "enterprise") { setMsg({ t: t("b.contact"), ok: true }); return; }
    setBusy(target); setMsg(null);
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: target }) });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok && j.url) { window.location.href = j.url; return; }
      if (r.status === 503) setMsg({ t: t("b.notconf"), ok: false });
      else setMsg({ t: j.error || ("Checkout failed (HTTP " + r.status + ")"), ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setBusy(""); }
  }

  async function openPaymentMethodForm() {
    setPmBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/billing/setup-intent", { method: "POST" });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok && j.clientSecret) setPmClientSecret(j.clientSecret);
      else setMsg({ t: j.error || "Could not start payment-method update.", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setPmBusy(false); }
  }
  function onPaymentMethodSaved() {
    setPmClientSecret(null);
    setMsg({ t: t("b.pmSaved"), ok: true });
  }

  async function toggleCancel(resume: boolean) {
    if (!resume && !window.confirm(t("b.cancelConfirm"))) return;
    setCancelBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/billing/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume }) });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok) setSubInfo((s) => (s ? { ...s, cancelAtPeriodEnd: j.cancelAtPeriodEnd } : s));
      else setMsg({ t: j.error || "Could not update the subscription.", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setCancelBusy(false); }
  }

  const bar = (used: number, limit: number, label: string) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span className="muted">{label}</span><span className="mono">{used.toLocaleString()} / {lim(limit)}</span></div>
      <div style={{ height: 8, background: "var(--line)", borderRadius: 6, overflow: "hidden", marginTop: 4 }}>
        <div style={{ height: "100%", width: pct(used, limit) + "%", background: pct(used, limit) >= 90 ? "var(--bad)" : "var(--acc, #EE5020)" }} />
      </div>
    </div>
  );

  // AI usage renders as a percentage, not used/limit — see the AgentUsage
  // type's own comment above for why the real numbers never reach this
  // component at all. Renders nothing for "unavailable" (Free, no AI on
  // this plan) AND "unlimited" (Enterprise) — deliberately not "Unlimited"
  // text: that word is a promise, and Enterprise's real PLAN_LIMITS value
  // being Infinity today doesn't mean it always will be (a fair-use ceiling
  // could get added later the same way Pro's own did). Safer to say
  // nothing here than to publish a claim in the product UI that a future
  // plan change would make retroactively false. Enterprise usage, if ever
  // discussed, is a conversation with their account contact, not a bar on
  // this page.
  const aiBar = (ai: AgentUsage) => {
    if (ai.status !== "metered") return null;
    const percent = ai.percentUsed;
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span className="muted">{t("b.usageAI")}</span><span className="mono">{percent}%</span></div>
        <div style={{ height: 8, background: "var(--line)", borderRadius: 6, overflow: "hidden", marginTop: 4 }}>
          <div style={{ height: "100%", width: percent + "%", background: percent >= 90 ? "var(--bad)" : "var(--acc, #EE5020)" }} />
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.billing")}</h1><p>{t("b.sub")}</p></div>
        <div className="vh-act"><button className="btn btn--g" onClick={load}><Icon name="undo" />{t("al.refresh")}</button></div>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}
      {msg && <div className="panel"><span className={"badge " + (msg.ok ? "b-ok" : "b-warn")}><span className="dot" /></span><span style={{ marginLeft: 10 }}>{msg.t}</span></div>}

      {!err && (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>{t("b.current")}: <span style={{ color: "var(--acc, #EE5020)" }}>{plan.name}</span></h3>
              <span className={"badge " + (tenant?.subscriptionStatus === "past_due" ? "b-warn" : "b-ok")}><span className="dot" />{tenant?.subscriptionStatus || "active"}</span>
              <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>{plan.price}</span>
            </div>
            <div style={{ marginTop: 14, maxWidth: 520 }}>
              {bar(usage.content, plan.items, t("b.usageContent"))}
              {bar(usage.seats, plan.seats, t("b.usageSeats"))}
              {aiBar(usage.ai)}
            </div>
            {tenant?.subscriptionStatus === "past_due" && (
              <div className="notice" style={{ marginTop: 12, borderColor: "var(--bad)" }}><Icon name="bell" /> {t("b.pastDue")}</div>
            )}
            {planId === "pro" && subInfo && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                {subInfo.currentPeriodEnd && (
                  <span className="muted">
                    {(subInfo.cancelAtPeriodEnd ? t("b.cancelsOn") : t("b.renewsOn")) + " " + new Date(subInfo.currentPeriodEnd).toLocaleDateString()}
                  </span>
                )}
                {subInfo.cancelAtPeriodEnd ? (
                  <button className="btn btn--g" disabled={cancelBusy} onClick={() => toggleCancel(true)}>{cancelBusy ? "…" : t("b.resumeSub")}</button>
                ) : (
                  <button className="btn btn--g" disabled={cancelBusy} onClick={() => toggleCancel(false)}>{cancelBusy ? "…" : t("b.cancelSub")}</button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {PLANS.map((p) => {
              const isCurrent = p.id === planId;
              const order = ["free", "pro", "enterprise"];
              const isUpgrade = order.indexOf(p.id) > order.indexOf(planId);
              return (
                <div key={p.id} className="panel" style={{ flex: "1 1 240px", minWidth: 240, border: isCurrent ? "2px solid var(--acc, #EE5020)" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <b style={{ fontSize: 18 }}>{p.name}</b>
                    {isCurrent && <span className="badge b-acc">{t("b.current")}</span>}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 12px" }}>{p.price}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, marginBottom: 14 }}>
                    <span className="muted">{lim(p.items)} {t("b.items")} · {lim(p.seats)} {t("b.seats")}</span>
                    {p.features.map((f) => <span key={f} style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="check" />{t("bf." + f.slice(2))}</span>)}
                  </div>
                  {isCurrent ? (
                    <button className="btn btn--g" disabled style={{ width: "100%" }}>{t("b.currentBtn")}</button>
                  ) : isUpgrade ? (
                    <button className="btn btn--p" style={{ width: "100%" }} disabled={busy === p.id} onClick={() => upgrade(p.id)}>{busy === p.id ? "…" : (p.id === "enterprise" ? t("b.contactBtn") : t("b.upgrade"))}</button>
                  ) : (
                    <button className="btn btn--g" disabled style={{ width: "100%" }}>{t("b.included")}</button>
                  )}
                </div>
              );
            })}
          </div>

          {planId === "pro" && (
            <div className="panel" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 style={{ margin: 0 }}>{t("b.paymentMethod")}</h3>
                {!pmClientSecret && (
                  <button className="btn btn--g" onClick={openPaymentMethodForm} disabled={pmBusy}>{pmBusy ? "…" : t("b.updatePaymentMethod")}</button>
                )}
              </div>
              {pmClientSecret && stripePromise ? (
                <Elements stripe={stripePromise} options={{ clientSecret: pmClientSecret }}>
                  <PaymentMethodForm onSaved={onPaymentMethodSaved} onCancel={() => setPmClientSecret(null)} />
                </Elements>
              ) : (
                <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{t("b.pmHint")}</p>
              )}
            </div>
          )}

          {planId === "pro" && (
            <div className="panel" style={{ marginTop: 16 }}>
              <h3 style={{ margin: 0 }}>{t("b.invoices")}</h3>
              {invoices.length === 0 ? (
                <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{t("b.noInvoices")}</p>
              ) : (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {invoices.map((inv) => (
                    <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                      <span className="muted" style={{ minWidth: 100 }}>{inv.date ? new Date(inv.date).toLocaleDateString() : "—"}</span>
                      <span className="mono">{(inv.amount / 100).toLocaleString(undefined, { style: "currency", currency: (inv.currency || "usd").toUpperCase() })}</span>
                      <span className={"badge " + (inv.status === "paid" ? "b-ok" : "b-warn")}><span className="dot" />{inv.status}</span>
                      {inv.pdfUrl && (
                        <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn--g" style={{ marginLeft: "auto", padding: "4px 10px" }}>{t("b.viewInvoice")}</a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="notice" style={{ marginTop: 16 }}><Icon name="lock" /> {t("b.foot")}</div>
        </>
      )}
    </>
  );
}
