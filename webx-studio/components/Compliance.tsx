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
      const [audit, compliance] = await Promise.all([
        fetch("/api/ai/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/cms/compliance?tenant=" + encodeURIComponent(tenant)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const findings: any[] = audit?.findings || [];
      const pdpa = findings.filter((f) => String(f.dimension).includes("PDPA")).length;
      const seo = findings.filter((f) => String(f.dimension).includes("SEO")).length;
      const wcag = findings.filter((f) => String(f.dimension) === "WCAG").length;
      const geo = await Promise.all(["sitemap.xml", "robots.txt", "llms.txt"].map((p) => fetch("/api/strapi/" + p).then((r) => r.ok).catch(() => false)));
      const geoOk = geo.every(Boolean);
      setScanned(audit?.scanned ?? null);

      const contrast = audit?.brandContrast;
      const wcagDetail = (wcag === 0 ? t("cp.wcagOk") : wcag + " " + t("cp.wcagGaps"))
        + " · " + (contrast ? (contrast.ok ? t("cp.contrastOk") : t("cp.contrastLow")).replace("{r}", String(contrast.ratio)) : t("cp.wcagE"));

      const sec = compliance?.sec as { totalAdmins: number; mfaEnabledCount: number; mfaAdoptionPct: number } | undefined;
      const secOk = !sec || sec.mfaAdoptionPct === 100;
      const secDetail = sec ? t("cp.mfaAdopt").replace("{a}", String(sec.mfaEnabledCount)).replace("{b}", String(sec.totalAdmins)) : t("cp.secE");

      const rel = compliance?.rel as { building: boolean; lastBuiltAt: string | null; lastError: string | null } | undefined;
      const relOk = !!rel?.lastBuiltAt && !rel.lastError;
      const relDetail = !rel ? t("cp.relE")
        : rel.lastError ? t("cp.buildFailed")
        : !rel.lastBuiltAt ? t("cp.neverBuilt")
        : t("cp.builtOn").replace("{t}", new Date(rel.lastBuiltAt).toLocaleString());

      setDims([
        { key: "pdpa", status: pdpa === 0 ? "pass" : "warn", detail: t("cp.pdpaE") + " · " + (pdpa === 0 ? t("cp.noflag") : pdpa + " " + t("cp.flags")), href: "/content-audit" },
        { key: "seo", status: geoOk && seo === 0 ? "pass" : "warn", detail: (geoOk ? t("cp.geoOk") : t("cp.geoNo")) + " · " + seo + " " + t("cp.metagaps"), href: "/schema" },
        { key: "wcag", status: wcag === 0 && (!contrast || contrast.ok) ? "pass" : "warn", detail: wcagDetail, href: "/branding" },
        { key: "sec", status: secOk ? "pass" : "warn", detail: secDetail, href: "/account/security" },
        { key: "rel", status: relOk ? "pass" : "warn", detail: relDetail, href: "/status" },
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
