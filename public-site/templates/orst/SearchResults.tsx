"use client";
// Real site search (TOR gap audit) — the header's own "ค้นหา" button and
// this route existed as dead ends until now; see lib/useSiteSearch.ts for
// the WordPress-side backend this calls.
import { useEffect, useState } from "react";
import { useSiteSearch } from "@/lib/useSiteSearch";

const TYPE_LABELS: Record<string, string> = {
  page: "หน้าเว็บไซต์",
  post: "ข่าว/บทความ",
  service: "บริการ",
  publication: "สิ่งพิมพ์",
  faq: "คำถามที่พบบ่อย",
  resource: "แหล่งข้อมูล",
  "timeline-event": "เหตุการณ์สำคัญ",
  "mission-item": "ภารกิจ",
  "org-unit": "หน่วยงาน",
  document: "เอกสาร",
};

export default function SearchResults() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") || "";
    setQuery(initial);
    setSubmitted(initial);
  }, []);

  const { results, status } = useSiteSearch("orst", submitted);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    setSubmitted(q);
    const url = new URL(window.location.href);
    if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
    window.history.replaceState({}, "", url.toString());
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 780 }}>
        <h1>ค้นหา</h1>
        <form onSubmit={onSubmit} className="search-form" role="search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาบริการ ข่าวสาร คำถามที่พบบ่อย และเอกสาร..."
            aria-label="ค้นหาในเว็บไซต์"
            autoFocus
          />
          <button type="submit" className="btn">ค้นหา</button>
        </form>

        {status === "loading" && <p className="muted" style={{ marginTop: 24 }}>กำลังค้นหา...</p>}
        {status === "error" && <p className="muted" style={{ marginTop: 24 }}>ไม่สามารถค้นหาได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง</p>}
        {status === "done" && results.length === 0 && (
          <p className="muted" style={{ marginTop: 24 }}>ไม่พบผลลัพธ์สำหรับ “{submitted}”</p>
        )}
        {results.length > 0 && (
          <>
            <p className="muted" style={{ marginTop: 24 }}>พบ {results.length} รายการสำหรับ “{submitted}”</p>
            <ul className="search-results-list">
              {results.map((r) => (
                <li key={r.type + r.id} className="content-card search-result-item">
                  <span className="search-result-type">{TYPE_LABELS[r.subtype] || r.subtype}</span>
                  <a href={r.url}>{r.title || "(ไม่มีชื่อเรื่อง)"}</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
