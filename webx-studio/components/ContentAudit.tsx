"use client";
import { useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";

type Finding = { docId: string; contentType: string; title: string; dimension: string; severity: "high" | "med" | "low"; message: string };
const sevBadge = (s: string) => (s === "high" ? "b-warn" : s === "med" ? "b-acc" : "b-mut");
const shortType = (c: string) => c.replace(/^api::/, "").replace(/\..*$/, "");

export default function ContentAudit() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [scanned, setScanned] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "dga";

  async function run() {
    setRunning(true); setErr(""); setFindings([]); setScanned(null); setFilter("");
    try {
      const r = await fetch("/api/ai/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant }) });
      if (!r.ok) { setErr(t("ca.fail") + " (HTTP " + r.status + ")"); setRunning(false); return; }
      const j = await r.json();
      setFindings(j.findings || []); setScanned(j.scanned ?? 0); setAiUsed(!!j.aiUsed);
    } catch { setErr("Cannot reach the backend."); }
    finally { setRunning(false); }
  }

  const dims = Array.from(new Set(findings.map((f) => f.dimension)));
  const shown = filter ? findings.filter((f) => f.dimension === filter) : findings;
  const counts = { high: findings.filter((f) => f.severity === "high").length, med: findings.filter((f) => f.severity === "med").length, low: findings.filter((f) => f.severity === "low").length };

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.content-audit")}</h1><p>{t("ca.sub")}</p></div>
        <div className="vh-act">
          <button className="btn btn--p" onClick={run} disabled={running}><Icon name="activity" />{running ? t("ca.running") : t("ca.run")}</button>
        </div>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}

      {scanned != null && !err && (
        <div className="panel" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <span className="muted">{t("ca.scanned").replace("{n}", String(scanned))} · {findings.length} {t("ca.issues")}</span>
          <span className="badge b-warn"><span className="dot" />{counts.high} high</span>
          <span className="badge b-acc"><span className="dot" />{counts.med} med</span>
          <span className="badge b-mut"><span className="dot" />{counts.low} low</span>
          <span className="muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>{aiUsed ? t("ca.aiused") : t("ca.rulesonly")}</span>
        </div>
      )}

      {findings.length > 0 && (
        <>
          <div className="cbar" style={{ marginBottom: 10 }}>
            <div className="seg" style={{ flexWrap: "wrap" }}>
              <button className={filter === "" ? "on" : ""} onClick={() => setFilter("")}>{t("ca.all")}</button>
              {dims.map((d) => <button key={d} className={filter === d ? "on" : ""} onClick={() => setFilter(d)}>{d}</button>)}
            </div>
          </div>
          <div className="panel" style={{ padding: "8px 0" }}>
            <table className="tbl"><tbody>
              {shown.map((f, i) => (
                <tr key={i}>
                  <td style={{ width: 64 }}><span className={"badge " + sevBadge(f.severity)}><span className="dot" />{f.severity}</span></td>
                  <td style={{ width: 120 }}><span className="badge b-acc">{f.dimension}</span></td>
                  <td><b>{f.title}</b> <span className="muted mono" style={{ fontSize: 11 }}>· {shortType(f.contentType)}</span><div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{f.message}</div></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </>
      )}
      {scanned === 0 && !err && <div className="muted" style={{ padding: 20, textAlign: "center" }}>{t("ca.clean")}</div>}

      <div className="notice"><Icon name="shield" /> {t("ca.note")}</div>
    </>
  );
}
