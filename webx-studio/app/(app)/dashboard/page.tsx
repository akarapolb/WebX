"use client";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { useLang } from "@/components/LangProvider";
import { useTenant } from "@/components/TenantProvider";
import Onboarding from "@/components/Onboarding";
import { cms } from "@/lib/cms";

const SERIES = [42, 55, 48, 63, 58, 71, 66, 80, 76, 88, 82, 95];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const HEALTH: [string, string][] = [
  ["API latency (p95)", "84 ms"], ["Edge cache hit", "98.7%"], ["SSL / TLS", "Valid · A+"],
  ["Last backup", "3h ago"], ["DR replication", "In sync"],
];

export default function Dashboard() {
  const { t, lang } = useLang();
  const { currentKey, engine } = useTenant();
  const [email, setEmail] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ articles?: number; services?: number; submissions?: number }>({});
  const mx = Math.max(...SERIES);

  useEffect(() => {
    cms.auth.me().then((u) => setEmail(u?.email ?? null)).catch(() => {});
  }, []);

  const count = useCallback(async (uid: string): Promise<number | undefined> => {
    // tenant.key filtering is a Strapi-side relation field — WordPress
    // tenant-scoping happens adapter-side via the wtenant taxonomy, not a
    // filter this route understands, so only apply it for Strapi uids.
    const filter = engine !== "wordpress" && currentKey && currentKey !== "workspace"
      ? [{ field: "tenant.key", op: "eq" as const, value: currentKey }] : undefined;
    try {
      const { total } = await cms.entries.list(uid, { page: 1, pageSize: 1, filter });
      return total;
    } catch { return undefined; }
  }, [currentKey, engine]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Strapi and WordPress engines use different content-type uids for the
      // same concepts (api::article.article vs wp:post, etc. — see
      // lib/cms/wordpress.ts's POST_TYPES) — querying the wrong engine's uids
      // always 400s, which used to be swallowed silently, leaving every
      // WordPress-engine tenant's (ORST/RoyalSociety/NBTC) dashboard KPIs
      // stuck on "—" forever despite being labeled "live".
      const uids = engine === "wordpress"
        ? ["wp:post", "wp:service", "wp:complaint", "wp:application", "wp:contact-message"]
        : ["api::article.article", "api::service.service", "api::complaint.complaint", "api::application.application", "api::contact-message.contact-message"];
      const [a, s, c1, c2, c3] = await Promise.all(uids.map(count));
      if (!alive) return;
      const sub = [c1, c2, c3].filter((n) => typeof n === "number").reduce((x, n) => x + (n as number), 0);
      setCounts({ articles: a, services: s, submissions: [c1, c2, c3].some((n) => n != null) ? sub : undefined });
    })();
    return () => { alive = false; };
  }, [count, engine]);

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
          {/* Monthly report gap (TOR) — this used to be a decorative
              <button> with no onClick at all (found live: clicking it did
              nothing). Real KPIs on this page are still limited (uptime is
              hardcoded — see the `real:false` flag above), so this points
              at Analytics' own report generator (real first-party metrics,
              current month, current tenant) rather than exporting this
              page's own partly-simulated numbers. */}
          <a className="btn btn--g" href={"/api/strapi/api/analytics/report" + (currentKey && currentKey !== "workspace" ? "?tenant=" + encodeURIComponent(currentKey) : "")}>
            <Icon name="doc" />{t("dash.export")}
          </a>
        </div>
      </div>

      <Onboarding />

      {email && (
        <div className="panel" style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="badge b-ok"><span className="dot" />{engine === "wordpress" ? (lang === "th" ? "WORDPRESS · เชื่อมต่อแล้ว" : "WORDPRESS · CONNECTED") : t("tb.connected")}</span>
          <span className="muted">{engine === "wordpress" ? (lang === "th" ? "เข้าสู่ระบบ WordPress เป็น" : "Authenticated to WordPress as") : t("dash.connected")} <b style={{ color: "var(--ink)" }}>{email}</b> · {t("dash.httponly")}</span>
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
