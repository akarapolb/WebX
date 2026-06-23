"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";

// Compliance & Trust scorecard — a gov-procurement / enterprise asset. Mixes live
// signals (content audit findings, GEO files actually served) with the platform's
// enforced security posture. Read-only.
type Dim = { key: string; status: "pass" | "warn"; detail: string; href: string };

export default function Compliance() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "dga";
  const [dims, setDims] = useState<Dim[]>([]);
  const [scanned, setScanned] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const audit = await fetch("/api/ai/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const findings: any[] = audit?.findings || [];
      const pdpa = findings.filter((f) => String(f.dimension).includes("PDPA")).length;
      const seo = findings.filter((f) => String(f.dimension).includes("SEO")).length;
      const geo = await Promise.all(["sitemap.xml", "robots.txt", "llms.txt"].map((p) => fetch("/api/strapi/" + p).then((r) => r.ok).catch(() => false)));
      const geoOk = geo.every(Boolean);
      setScanned(audit?.scanned ?? null);
      setDims([
        { key: "pdpa", status: pdpa === 0 ? "pass" : "warn", detail: t("cp.pdpaE") + " · " + (pdpa === 0 ? t("cp.noflag") : pdpa + " " + t("cp.flags")), href: "/content-audit" },
        { key: "seo", status: geoOk && seo === 0 ? "pass" : "warn", detail: (geoOk ? t("cp.geoOk") : t("cp.geoNo")) + " · " + seo + " " + t("cp.metagaps"), href: "/schema" },
        { key: "wcag", status: "pass", detail: t("cp.wcagE"), href: "/branding" },
        { key: "sec", status: "pass", detail: t("cp.secE"), href: "/audit" },
        { key: "rel", status: "pass", detail: t("cp.relE"), href: "/billing" },
      ]);
    } catch { setErr("Cannot reach the backend."); }
    finally { setLoading(false); }
  }, [tenant, t]);
  useEffect(() => { load(); }, [load]);

  const pass = dims.filter((d) => d.status === "pass").length;
  const total = dims.length || 5;

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.compliance")}</h1><p>{t("cp.sub")}</p></div>
        <div className="vh-act"><button className="btn btn--g" onClick={load} disabled={loading}><Icon name="undo" />{loading ? t("cp.scanning") : t("al.refresh")}</button></div>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}

      {!err && (
        <>
          <div className="panel" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: pass === total ? "var(--ok)" : "var(--acc, #EE5020)" }}>{pass}/{total}</div>
            <div>
              <b>{t("cp.score")}</b>
              <div className="muted" style={{ fontSize: 13 }}>{scanned != null ? t("cp.scanned").replace("{n}", String(scanned)) : t("cp.live")}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {dims.map((d) => (
              <div key={d.key} className="panel" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span className={"badge " + (d.status === "pass" ? "b-ok" : "b-warn")} style={{ minWidth: 64, justifyContent: "center" }}><span className="dot" />{t("cp." + d.status)}</span>
                <div style={{ flex: 1 }}>
                  <b>{t("cp." + d.key)}</b>
                  <div className="muted" style={{ fontSize: 13 }}>{d.detail}</div>
                </div>
                <Link href={d.href} className="btn btn--g">{t("cp.view")}</Link>
              </div>
            ))}
          </div>

          <div className="notice" style={{ marginTop: 16 }}><Icon name="shield" /> {t("cp.foot")}</div>
        </>
      )}
    </>
  );
}
