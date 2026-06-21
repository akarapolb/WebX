"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";

type Log = { id: number; documentId?: string; consentId?: string; action?: string; categories?: any; language?: string; path?: string; userAgent?: string; createdAt?: string };
const CL_UID = "api::consent-log.consent-log";
const actBadge = (a?: string) => (a === "accept" ? "b-ok" : a === "reject" ? "b-warn" : "b-acc");

// Standard PDPA cookie categories (reference shown in the manager).
const CATS = [
  { key: "necessary", en: "Necessary", th: "จำเป็น", note_en: "Always on — site can't function without it.", note_th: "เปิดเสมอ — เว็บทำงานไม่ได้ถ้าไม่มี" },
  { key: "functional", en: "Functional", th: "การใช้งาน", note_en: "Remembers preferences (language, etc.).", note_th: "จดจำการตั้งค่า (ภาษา ฯลฯ)" },
  { key: "analytics", en: "Analytics", th: "สถิติ", note_en: "Anonymous usage measurement.", note_th: "วัดการใช้งานแบบไม่ระบุตัวตน" },
  { key: "marketing", en: "Marketing", th: "การตลาด", note_en: "Off by default — opt-in only.", note_th: "ปิดเป็นค่าเริ่มต้น — ต้องยินยอมก่อน" },
];

export default function ConsentLog() {
  const { t, lang } = useLang();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + CL_UID + "?sort=createdAt:DESC&pageSize=200");
      if (r.status === 403) { setErr(t("c.noPerm")); setLoading(false); return; }
      if (!r.ok) { setErr("Could not load consent logs (HTTP " + r.status + ")."); setLoading(false); return; }
      const j = await r.json();
      setLogs(j.results ?? j.data ?? []);
    } catch { setErr("Cannot reach the backend."); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const count = (a: string) => logs.filter((l) => l.action === a).length;
  const shown = filter ? logs.filter((l) => l.action === filter) : logs;
  const catList = (c: any) => {
    if (!c || typeof c !== "object") return [];
    return Object.entries(c).filter(([, v]) => v === true || v === "true").map(([k]) => k);
  };

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.consent")}</h1><p>{t("cl.sub")}</p></div>
        <div className="vh-act"><button className="btn btn--g" onClick={load}><Icon name="undo" />{t("al.refresh")}</button></div>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}

      {!err && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[{ a: "", l: t("cl.all"), n: logs.length }, { a: "accept", l: t("an.accept"), n: count("accept") }, { a: "reject", l: t("an.reject"), n: count("reject") }, { a: "custom", l: t("an.custom"), n: count("custom") }].map((s) => (
              <button key={s.a} className={"badge " + (filter === s.a ? "b-acc" : "b-mut")} style={{ cursor: "pointer", border: "none" }} onClick={() => setFilter(s.a)}><b>{s.n}</b>&nbsp;{s.l}</button>
            ))}
          </div>

          <div className="panel" style={{ marginBottom: 14 }}>
            <h3 style={{ margin: "0 0 8px" }}>{t("cl.cats")} <span className="badge b-acc" style={{ fontSize: 11 }}>PDPA</span></h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {CATS.map((c) => (
                <div key={c.key} style={{ flex: "1 1 200px", minWidth: 200, borderLeft: "3px solid var(--line)", paddingLeft: 10 }}>
                  <b>{lang === "th" ? c.th : c.en}</b> <span className="mono muted" style={{ fontSize: 12 }}>{c.key}</span>
                  <div className="muted" style={{ fontSize: 12 }}>{lang === "th" ? c.note_th : c.note_en}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            {loading && logs.length === 0 && <span className="muted">{t("cl.loading")}</span>}
            {!loading && shown.length === 0 && <span className="muted">{t("an.none")}</span>}
            {shown.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "6px 8px" }}>{t("cl.time")}</th>
                    <th style={{ padding: "6px 8px" }}>{t("cl.action")}</th>
                    <th style={{ padding: "6px 8px" }}>{t("cl.categories")}</th>
                    <th style={{ padding: "6px 8px" }}>{t("cl.lang")}</th>
                    <th style={{ padding: "6px 8px" }}>{t("cl.path")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 200).map((l) => (
                    <tr key={l.id} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{l.createdAt ? new Date(l.createdAt).toLocaleString() : "—"}</td>
                      <td style={{ padding: "6px 8px" }}><span className={"badge " + actBadge(l.action)}>{l.action || "—"}</span></td>
                      <td style={{ padding: "6px 8px" }}>{catList(l.categories).map((c) => <span key={c} className="badge b-mut" style={{ marginRight: 4 }}>{c}</span>)}{catList(l.categories).length === 0 ? <span className="muted">—</span> : null}</td>
                      <td style={{ padding: "6px 8px" }} className="mono">{l.language || "—"}</td>
                      <td style={{ padding: "6px 8px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="muted">{l.path || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="notice" style={{ marginTop: 14 }}><Icon name="shield" /> {t("cl.foot")}</div>
        </>
      )}
    </>
  );
}
