"use client";
// dgahub template — the search page's design. Index, ranking and the ?q= state
// come from the WebX site kit (components/site/useStaticSearch.ts,
// lib/site/search.ts); the index is built at export time from the CMS.
import Snippet from "@/components/site/Snippet";
import { useStaticSearch } from "@/components/site/useStaticSearch";
import { useSearchReporter } from "@/components/site/searchAnalytics";

export default function Search({ locale }: { locale: "th" | "en" }) {
  const en = locale === "en";
  const report = useSearchReporter("dgahub", locale);
  const { q, setQ, terms, docs, failed, results, input } = useStaticSearch((en ? "/en" : "") + "/dgahub/search-index.json", report);

  const status = !terms.length ? "" : !docs ? (failed ? "" : en ? "Loading…" : "กำลังโหลด…")
    : results.length ? (en ? `${results.length} result${results.length === 1 ? "" : "s"} for “${q.trim()}”` : `พบ ${results.length} รายการสำหรับ “${q.trim()}”`)
    : (en ? `No results for “${q.trim()}”. Try fewer or shorter words.` : `ไม่พบผลลัพธ์สำหรับ “${q.trim()}” ลองใช้คำที่สั้นลงหรือน้อยลง`);

  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <h1>{en ? "Search" : "ค้นหา"}</h1>
          <form role="search" className="dh-search-big" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="dh-q" className="visually-hidden">{en ? "Search this site" : "ค้นหาในเว็บไซต์"}</label>
            <input id="dh-q" ref={input} type="search" value={q} autoComplete="off"
              placeholder={en ? "e.g. EGDI, open data, PDPA" : "เช่น EGDI ข้อมูลเปิด PDPA"} onChange={(e) => setQ(e.target.value)} />
          </form>
        </div>
      </div>
      <section className="section">
        <div className="wrap">
          <p className="muted" role="status" aria-live="polite">{status}</p>
          {failed && <p role="alert">{en ? "Search is unavailable right now. Please use the menu." : "ระบบค้นหาไม่พร้อมใช้งานขณะนี้ กรุณาใช้เมนู"}</p>}
          {results.length > 0 && (
            <ol className="dh-results">
              {results.map(({ d }, i) => (
                <li key={i}>
                  <a href={d.u}>{d.t}</a>
                  {d.s && d.s !== d.t && <span className="tag neutral">{d.s}</span>}
                  <p><Snippet text={d.x || d.t} terms={terms} /></p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}
