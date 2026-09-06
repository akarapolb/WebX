"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";

type Summary = {
  scope: string; generatedAt: string;
  content: Record<string, number>; contentTotal: number;
  submissions: { complaints: number; applications: number; registrations: number; total: number };
  consent: { total: number; accept: number; reject: number; custom: number };
  engagement: { totalArticleViews: number; topArticles: { title?: string; views?: number }[] };
  polls: { question?: string; totalVotes?: number }[];
  recentAudit: { action: string; contentType: string; adminEmail: string; at: string }[];
  externalAnalytics: Record<string, any> | null;
  tenants: { key: string; name: string }[];
};
const shortType = (c: string) => String(c || "").replace(/^api::/, "").replace(/\..*$/, "");
const fmt = (n: number) => (typeof n === "number" ? n.toLocaleString() : "0");

function Stat({ icon, label, value, hint }: { icon: string; label: string; value: string | number; hint?: string }) {
  return (
    <div className="panel" style={{ flex: "1 1 160px", minWidth: 160 }}>
      <div className="muted" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><Icon name={icon} />{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {hint ? <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function currentMonthValue(): string {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

export default function Analytics() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Monthly report gap (TOR — no "report" concept existed anywhere before
  // this, and the Dashboard's own "Export" button had no onClick at all).
  // Defaults to the current month — unlike public-site's static export,
  // this app server-renders per request, so there's no real server/client
  // clock-skew risk here (the gap is milliseconds, not until-the-next-
  // deploy) the way it was for public-site's ShareButtons/EventCalendar.
  const [reportMonth, setReportMonth] = useState(currentMonthValue());
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "";

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/strapi/api/analytics/summary" + (tenant ? "?tenant=" + encodeURIComponent(tenant) : ""));
      if (r.status === 403) { setErr(t("c.noPerm")); setLoading(false); return; }
      if (!r.ok) { setErr("Could not load analytics (HTTP " + r.status + ")."); setLoading(false); return; }
      setData(await r.json());
    } catch { setErr("Cannot reach the backend."); }
    finally { setLoading(false); }
  }, [tenant, t]);
  useEffect(() => { load(); }, [load]);

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const c = data?.consent;
  const ext = data?.externalAnalytics || {};
  // Real GA4 Data API pull (TOR gap audit — this panel used to just echo the
  // tenant's own tracking id back, never real traffic numbers) — rendered
  // separately below as real stat badges; excluded from the generic
  // tracking-id echo loop so it doesn't stringify as "[object Object]".
  const ga4Metrics = (ext as any).ga4Metrics as { activeUsers: number; screenPageViews: number; sessions: number; rangeDays: number } | undefined;
  const extKeys = Object.entries(ext).filter(([k, v]) => k !== "ga4Metrics" && v && String(v).trim());

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.analytics")}</h1><p>{t("an.sub")}</p></div>
        <div className="vh-act" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)}
            style={{ background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 9, padding: "8px 10px", fontSize: 13, color: "var(--ink)" }} />
          <a className="btn btn--p" href={"/api/strapi/api/analytics/report?month=" + encodeURIComponent(reportMonth) + (tenant ? "&tenant=" + encodeURIComponent(tenant) : "")}>
            <Icon name="doc" />{t("an.report")}
          </a>
          <button className="btn btn--g" onClick={load}><Icon name="undo" />{t("al.refresh")}</button>
        </div>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}
      {loading && !data && <div className="panel"><span className="muted">{t("an.loading")}</span></div>}

      {!err && data && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Stat icon="doc" label={t("an.content")} value={fmt(data.contentTotal)} />
            <Stat icon="inbox" label={t("an.submissions")} value={fmt(data.submissions.total)} hint={t("an.pdpa")} />
            <Stat icon="eye" label={t("an.views")} value={fmt(data.engagement.totalArticleViews)} />
            <Stat icon="check" label={t("an.consentRate")} value={c ? pct(c.accept, c.total) + "%" : "—"} hint={c ? fmt(c.total) + " " + t("an.events") : ""} />
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 10px" }}>{t("an.breakdown")}</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(data.content).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <span key={k} className="badge b-mut" style={{ gap: 6 }}><b>{fmt(n)}</b> {k}</span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
            <div className="panel" style={{ flex: "1 1 320px" }}>
              <h3 style={{ margin: "0 0 10px" }}>{t("an.top")}</h3>
              {(data.engagement.topArticles || []).length === 0 && <span className="muted">{t("an.none")}</span>}
              {(data.engagement.topArticles || []).map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{a.title || "—"}</span>
                  <span className="mono muted">{fmt(a.views || 0)}</span>
                </div>
              ))}
            </div>

            <div className="panel" style={{ flex: "1 1 320px" }}>
              <h3 style={{ margin: "0 0 10px" }}>{t("an.consentTitle")} <span className="badge b-acc" style={{ fontSize: 11 }}>PDPA</span></h3>
              {c && c.total > 0 ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="badge b-ok"><b>{fmt(c.accept)}</b> {t("an.accept")}</span>
                  <span className="badge b-warn"><b>{fmt(c.reject)}</b> {t("an.reject")}</span>
                  <span className="badge b-mut"><b>{fmt(c.custom)}</b> {t("an.custom")}</span>
                </div>
              ) : <span className="muted">{t("an.none")}</span>}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 10px" }}>{t("an.recent")}</h3>
            {(data.recentAudit || []).length === 0 && <span className="muted">{t("an.none")}</span>}
            {(data.recentAudit || []).map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
                <span className="badge b-mut">{a.action}</span>
                <span className="mono">{shortType(a.contentType)}</span>
                <span className="muted" style={{ marginLeft: "auto" }}>{a.adminEmail} · {a.at ? new Date(a.at).toLocaleString() : ""}</span>
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 6px" }}>{t("an.external")}</h3>
            {ga4Metrics && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: extKeys.length ? 10 : 0 }}>
                <span className="badge b-ok"><b>{fmt(ga4Metrics.activeUsers)}</b>&nbsp;active users</span>
                <span className="badge b-ok"><b>{fmt(ga4Metrics.screenPageViews)}</b>&nbsp;page views</span>
                <span className="badge b-ok"><b>{fmt(ga4Metrics.sessions)}</b>&nbsp;sessions</span>
                <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>last {ga4Metrics.rangeDays}d, real GA4 pull</span>
              </div>
            )}
            {extKeys.length ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {extKeys.map(([k, v]) => <span key={k} className="badge b-mut"><b>{k}</b>&nbsp;{String(v)}</span>)}
              </div>
            ) : !ga4Metrics && <span className="muted">{t("an.noext")}</span>}
          </div>

          <div className="notice" style={{ marginTop: 16 }}><Icon name="shield" /> {t("an.foot")}</div>
        </>
      )}
    </>
  );
}
