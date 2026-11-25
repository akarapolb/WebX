"use client";
// Search insights — what visitors type into the public site's search box, for
// the current workspace: the most frequent searches, and the searches that
// found nothing (content gaps worth a page, an FAQ or a synonym). Data comes
// from Strapi's search-stat (aggregated counts only; no IP, user agent or
// cookie is stored; queries that look like personal data are never saved).
// Only sites built with the WebX site kit search report here, and only when
// the published site can reach the CMS (PUBLIC_CMS_URL on the public site).
import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { cms, CmsError } from "@/lib/cms";

type Row = { id: number; documentId?: string; query: string; locale?: string; count?: number; results?: number; zeroCount?: number; lastAt?: string };
const UID = "api::search-stat.search-stat";

export default function SearchInsights() {
  const { lang } = useLang();
  const { currentKey, engine } = useTenant();
  const th = lang === "th";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [loc, setLoc] = useState<"" | "th" | "en">("");

  const load = useCallback(async () => {
    if (!currentKey || engine === "wordpress") { setRows([]); setLoading(false); return; }
    setLoading(true); setErr("");
    try {
      const { data } = await cms.entries.list<Row>(UID, { pageSize: 500, sort: "count:DESC", filter: [{ field: "tenant.key", op: "eq", value: currentKey }] });
      setRows(data);
    } catch (e) {
      setErr(e instanceof CmsError && e.status === 403
        ? (th ? "ไม่มีสิทธิ์ดูสถิติการค้นหา" : "You don't have permission to see search statistics.")
        : (th ? "โหลดสถิติการค้นหาไม่ได้" : "Could not load search statistics."));
    } finally { setLoading(false); }
  }, [currentKey, engine, th]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (loc ? rows.filter((r) => r.locale === loc) : rows), [rows, loc]);
  const total = shown.reduce((n, r) => n + (r.count || 0), 0);
  const zeroTotal = shown.reduce((n, r) => n + (r.zeroCount || 0), 0);
  const top = shown.slice(0, 15);
  const zero = shown.filter((r) => (r.results || 0) === 0).sort((a, b) => (b.zeroCount || 0) - (a.zeroCount || 0)).slice(0, 15);
  const when = (s?: string) => (s ? new Date(s).toLocaleDateString(th ? "th-TH" : "en-GB", { day: "numeric", month: "short" }) : "");

  if (engine === "wordpress") return null;
  return (
    <section className="panel" style={{ marginTop: 18 }} aria-labelledby="si-h">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div>
          <h2 id="si-h" style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><Icon name="search" />{th ? "สิ่งที่ผู้เข้าชมค้นหา" : "What visitors search for"}</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {th ? "จากช่องค้นหาบนเว็บไซต์สาธารณะ นับแบบไม่ระบุตัวตน" : "From the public site's search box, counted anonymously."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["", "th", "en"] as const).map((l) => (
            <button key={l || "all"} type="button" className={"btn " + (loc === l ? "btn--p" : "btn--g")} aria-pressed={loc === l} onClick={() => setLoc(l)}>
              {l === "" ? (th ? "ทุกภาษา" : "All") : l.toUpperCase()}
            </button>
          ))}
          <button type="button" className="btn btn--g" onClick={load}><Icon name="undo" />{th ? "รีเฟรช" : "Refresh"}</button>
        </div>
      </div>

      {err ? <p className="muted" role="alert">{err}</p> : loading ? <p className="muted">{th ? "กำลังโหลด…" : "Loading…"}</p> : !shown.length ? (
        <p className="muted" style={{ marginTop: 14 }}>
          {th ? "ยังไม่มีการค้นหา สถิติจะแสดงเมื่อมีผู้ใช้ช่องค้นหาบนเว็บไซต์ที่เชื่อมต่อ CMS" : "No searches yet. They appear once visitors use the search box on a site connected to the CMS."}
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "14px 0" }}>
            <div className="panel" style={{ flex: "1 1 140px" }}><div className="muted" style={{ fontSize: 13 }}>{th ? "การค้นหาทั้งหมด" : "Searches"}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{total.toLocaleString()}</div></div>
            <div className="panel" style={{ flex: "1 1 140px" }}><div className="muted" style={{ fontSize: 13 }}>{th ? "คำค้นที่ต่างกัน" : "Different queries"}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{shown.length.toLocaleString()}</div></div>
            <div className="panel" style={{ flex: "1 1 140px" }}><div className="muted" style={{ fontSize: 13 }}>{th ? "ไม่พบผลลัพธ์" : "Found nothing"}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{total ? Math.round((zeroTotal / total) * 100) : 0}%</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 15 }}>{th ? "คำค้นยอดนิยม" : "Top searches"}</h3>
              <table className="tbl">
                <thead><tr><th scope="col">{th ? "คำค้น" : "Query"}</th><th scope="col">{th ? "ภาษา" : "Lang"}</th><th scope="col" style={{ textAlign: "right" }}>{th ? "ครั้ง" : "Times"}</th><th scope="col" style={{ textAlign: "right" }}>{th ? "ผลลัพธ์" : "Results"}</th></tr></thead>
                <tbody>{top.map((r) => (
                  <tr key={r.documentId || r.id}><td>{r.query}</td><td>{(r.locale || "").toUpperCase()}</td><td style={{ textAlign: "right" }}>{r.count}</td><td style={{ textAlign: "right" }}>{r.results ? r.results : <span className="badge b-warn">0</span>}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div>
              <h3 style={{ fontSize: 15 }}>{th ? "ค้นแล้วไม่พบ (ควรเพิ่มเนื้อหา)" : "Searches that found nothing (content gaps)"}</h3>
              {zero.length ? (
                <table className="tbl">
                  <thead><tr><th scope="col">{th ? "คำค้น" : "Query"}</th><th scope="col">{th ? "ภาษา" : "Lang"}</th><th scope="col" style={{ textAlign: "right" }}>{th ? "ครั้ง" : "Times"}</th><th scope="col">{th ? "ล่าสุด" : "Last"}</th></tr></thead>
                  <tbody>{zero.map((r) => (
                    <tr key={r.documentId || r.id}><td>{r.query}</td><td>{(r.locale || "").toUpperCase()}</td><td style={{ textAlign: "right" }}>{r.zeroCount}</td><td>{when(r.lastAt)}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="muted">{th ? "ทุกคำค้นพบผลลัพธ์" : "Every search found something."}</p>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
