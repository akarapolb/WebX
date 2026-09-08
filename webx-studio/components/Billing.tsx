"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { cms, CmsError } from "@/lib/cms";

type Plan = { id: string; name: string; price: string; items: number; seats: number; features: string[] };
const PLANS: Plan[] = [
  { id: "free", name: "Free", price: "฿0", items: 50, seats: 1, features: ["f.cms", "f.builder", "f.consent", "f.community"] },
  { id: "pro", name: "Pro", price: "฿1,990 / mo", items: 1000, seats: 5, features: ["f.everyFree", "f.ai", "f.rag", "f.reviews", "f.priority"] },
  { id: "enterprise", name: "Enterprise", price: "Contact us", items: Infinity, seats: Infinity, features: ["f.everyPro", "f.sso", "f.sla", "f.dr", "f.audit"] },
];
const TEN = "api::tenant.tenant";

export default function Billing() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const [tenant, setTenant] = useState<any>(null);
  const [usage, setUsage] = useState<{ content: number; seats: number }>({ content: 0, seats: 0 });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const key = currentKey && currentKey !== "workspace" ? currentKey : "";

  const load = useCallback(async () => {
    setErr(""); setMsg(null);
    try {
      // no "|| dga" fallback — that silently showed a DIFFERENT real
      // tenant's billing/plan info for any session whose own tenant hasn't
      // resolved yet (found live: an ORST session with no roster match saw
      // DGA's plan/seat data). An empty key legitimately matches nothing,
      // which the existing tn=null / usage=0 fallback below already handles.
      if (!key) { setTenant(null); setUsage({ content: 0, seats: 0 }); return; }
      const { data } = await cms.entries.list<any>(TEN, { pageSize: 1, filter: [{ field: "key", op: "eq", value: key }] });
      const tn = data[0] || null;
      setTenant(tn);
      const seats = Array.isArray(tn?.adminEmails) ? tn.adminEmails.length : 0;
      // content-usage (not the raw Strapi proxy) so a WordPress-engine
      // workspace's usage reflects its own content, not just Strapi's.
      const a = await fetch("/api/cms/content-usage" + (key ? "?tenant=" + encodeURIComponent(key) : "")).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      setUsage({ content: a?.contentTotal ?? 0, seats });
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

  const bar = (used: number, limit: number, label: string) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span className="muted">{label}</span><span className="mono">{used.toLocaleString()} / {lim(limit)}</span></div>
      <div style={{ height: 8, background: "var(--line)", borderRadius: 6, overflow: "hidden", marginTop: 4 }}>
        <div style={{ height: "100%", width: pct(used, limit) + "%", background: pct(used, limit) >= 90 ? "var(--bad)" : "var(--acc, #EE5020)" }} />
      </div>
    </div>
  );

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
            </div>
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

          <div className="notice" style={{ marginTop: 16 }}><Icon name="lock" /> {t("b.foot")}</div>
        </>
      )}
    </>
  );
}
