"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { cms } from "@/lib/cms";

// Status & Observability — live service checks, tenant-isolation posture,
// and a recent-activity feed (from the audit log). Read-only.
const shortType = (c?: string) => String(c || "").replace(/^api::/, "").replace(/\.[^.]+$/, "");

type PubStatus = { building: boolean; lastBuiltAt: string | null; lastError: string | null };

export default function Status() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  // no "|| dga" fallback — silently showed a DIFFERENT real tenant's audit
  // feed for any session whose own tenant hasn't resolved yet.
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "";
  const [svc, setSvc] = useState<{ k: string; up: boolean }[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pub, setPub] = useState<PubStatus | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const loadPub = useCallback(async () => {
    const r = await fetch("/api/cms/public-site/status");
    if (r.ok) setPub(await r.json());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const checks = await Promise.all([
      cms.schema.listContentTypes().then(() => true).catch(() => false),
      fetch("/api/strapi/sitemap.xml").then((r) => r.ok).catch(() => false),
    ]);
    setSvc([{ k: "bff", up: true }, { k: "strapi", up: checks[0] }, { k: "delivery", up: checks[1] }]);
    const { data } = await cms.entries.list<any>("api::audit-log.audit-log", { sort: "at:DESC", pageSize: 8 }).catch(() => ({ data: [] as any[] }));
    setActivity(data);
    await loadPub();
    setLoading(false);
  }, [tenant, loadPub]);
  useEffect(() => { load(); }, [load]);

  async function rebuildNow() {
    setRebuilding(true);
    try {
      await fetch("/api/cms/public-site/rebuild", { method: "POST" }).catch(() => {});
      // Builds take tens of seconds; poll status until it flips back to idle
      // rather than making the admin hit Refresh repeatedly to find out.
      for (let i = 0; i < 150; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        const r = await fetch("/api/cms/public-site/status");
        if (!r.ok) break;
        const s: PubStatus = await r.json();
        setPub(s);
        if (!s.building) break;
      }
    } finally {
      setRebuilding(false);
      load();
    }
  }

  const allUp = svc.length > 0 && svc.every((s) => s.up);

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.status")}</h1><p>{t("st.sub")}</p></div>
        <div className="vh-act"><button className="btn btn--g" onClick={load} disabled={loading}><Icon name="undo" />{t("al.refresh")}</button></div>
      </div>

      <div className="panel" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, border: "1px solid " + (allUp ? "var(--ok)" : "var(--warn)") }}>
        <span className={"badge " + (allUp ? "b-ok" : "b-warn")} style={{ fontSize: 14 }}><span className="dot" /></span>
        <b style={{ fontSize: 18 }}>{allUp ? t("st.operational") : t("st.degraded")}</b>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="panel" style={{ flex: "1 1 280px" }}>
          <h3 style={{ margin: "0 0 10px" }}>{t("st.services")}</h3>
          {svc.map((s) => (
            <div key={s.k} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span>{t("st." + s.k)}</span>
              <span className={"badge " + (s.up ? "b-ok" : "b-warn")} style={{ marginLeft: "auto" }}><span className="dot" />{s.up ? t("st.up") : t("st.down")}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <h3 style={{ margin: "0 0 6px" }}>{t("st.publicSite")}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span data-testid="public-site-status" data-building={String(Boolean(pub?.building))} className={"badge " + (pub?.building ? "b-acc" : pub?.lastError ? "b-warn" : "b-ok")}>
              <span className="dot" />{pub?.building ? t("st.building") : pub?.lastError ? t("st.buildFailed") : t("st.upToDate")}
            </span>
            <span data-testid="public-site-last-built" data-last-built={pub?.lastBuiltAt || ""} className="muted" style={{ fontSize: 12.5 }}>
              {pub?.lastBuiltAt ? `${t("st.lastBuilt")} ${new Date(pub.lastBuiltAt).toLocaleString()}` : t("st.neverBuilt")}
            </span>
          </div>
          {pub?.lastError && <div className="mono" style={{ fontSize: 11.5, color: "var(--warn)", marginTop: 6 }}>{pub.lastError}</div>}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{t("st.publicSiteE")}</div>
        </div>
        <button data-testid="rebuild-now-btn" className="btn btn--p" onClick={rebuildNow} disabled={rebuilding || Boolean(pub?.building)}>
          <Icon name="undo" />{(rebuilding || pub?.building) ? t("st.rebuilding") : t("st.rebuildNow")}
        </button>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 6px" }}>{t("st.isolation")} <span className="badge b-acc" style={{ fontSize: 11 }}>{tenant}</span></h3>
        <div className="muted" style={{ fontSize: 13 }}>{t("st.isolationE")}</div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 10px" }}>{t("st.activity")}</h3>
        {!loading && activity.length === 0 && <span className="muted">{t("st.none")}</span>}
        {activity.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
            <span className="badge b-mut">{a.action}</span>
            <span className="mono">{shortType(a.contentType)}</span>
            <span className="muted" style={{ marginLeft: "auto" }}>{a.adminEmail} · {a.at ? new Date(a.at).toLocaleString() : ""}</span>
          </div>
        ))}
      </div>

      <div className="notice" style={{ marginTop: 16 }}><Icon name="activity" /> {t("st.foot")}</div>
    </>
  );
}
