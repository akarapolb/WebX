"use client";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { useLang } from "@/components/LangProvider";
import { useTenant } from "@/components/TenantProvider";
import Onboarding from "@/components/Onboarding";

const SERIES = [42, 55, 48, 63, 58, 71, 66, 80, 76, 88, 82, 95];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const HEALTH: [string, string][] = [
  ["API latency (p95)", "84 ms"], ["Edge cache hit", "98.7%"], ["SSL / TLS", "Valid · A+"],
  ["Last backup", "3h ago"], ["DR replication", "In sync"],
];

export default function Dashboard() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const [email, setEmail] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ articles?: number; services?: number; submissions?: number }>({});
  const mx = Math.max(...SERIES);

  useEffect(() => {
    fetch("/api/strapi/admin/users/me").then((r) => (r.ok ? r.json() : null)).then((j) => setEmail(j?.data?.email ?? null)).catch(() => {});
  }, []);

  const count = useCallback(async (uid: string): Promise<number | undefined> => {
    const tf = currentKey && currentKey !== "workspace" ? "&filters[tenant][key][$eq]=" + encodeURIComponent(currentKey) : "";
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + uid + "?page=1&pageSize=1" + tf);
      if (!r.ok) return undefined;
      const j = await r.json();
      return j.pagination?.total;
    } catch { return undefined; }
  }, [currentKey]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [a, s, c1, c2, c3] = await Promise.all([
        count("api::article.article"), count("api::service.service"),
        count("api::complaint.complaint"), count("api::application.application"), count("api::contact-message.contact-message"),
      ]);
      if (!alive) return;
      const sub = [c1, c2, c3].filter((n) => typeof n === "number").reduce((x, n) => x + (n as number), 0);
      setCounts({ articles: a, services: s, submissions: [c1, c2, c3].some((n) => n != null) ? sub : undefined });
    })();
    return () => { alive = false; };
  }, [count]);

  const nf = (n?: number) => (typeof n === "number" ? n.toLocaleString() : "—");
  const KPIS = [
    { key: "kpi.content", icon: "doc", val: nf(counts.articles), real: true },
    { key: "kpi.services", icon: "layout", val: nf(counts.services), real: true },
    { key: "kpi.submissions", icon: "inbox", val: nf(counts.submissions), real: true },
    { key: "kpi.uptime", icon: "code", val: "99.98%", real: false },
  ];

  return (
    <>
      <div className="vh">
        <div><h1>{t("dash.title")}</h1><p>{t("dash.sub")}</p></div>
        <div className="vh-act">
          <button className="btn btn--g"><Icon name="doc" />{t("dash.export")}</button>
        </div>
      </div>

      <Onboarding />

      {email && (
        <div className="panel" style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="badge b-ok"><span className="dot" />{t("tb.connected")}</span>
          <span className="muted">{t("dash.connected")} <b style={{ color: "var(--ink)" }}>{email}</b> · {t("dash.httponly")}</span>
        </div>
      )}

      <div className="kpis">
        {KPIS.map((k) => (
          <div className="kpi" key={k.key}>
            <div className="lab"><Icon name={k.icon} />{t(k.key)}</div>
            <div className="val mono">{k.val}</div>
            <div className="dl up">{k.real ? "● live" : "30d"}</div>
          </div>
        ))}
      </div>

      <div className="two">
        <div className="panel">
          <div className="panel-h"><h3>{t("dash.traffic")}</h3><span className="sub">{t("dash.sessions")}</span></div>
          <div className="bars">{SERIES.map((v, i) => <div key={i} className="bar" style={{ height: Math.round((v / mx) * 100) + "%" }} />)}</div>
          <div className="bar-x">{MONTHS.map((m, i) => <span key={i}>{m}</span>)}</div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>{t("dash.health")}</h3></div>
          {HEALTH.map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ color: "var(--ink2)", fontSize: 13 }}>{l}</span>
              <span className="badge b-ok"><span className="dot" />{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="notice"><Icon name="spark" /> {t("dash.realnote")}</div>
    </>
  );
}
