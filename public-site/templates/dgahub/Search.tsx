"use client";
// dgahub template — site search. Loads the index built at export time
// (searchIndex.ts → /dgahub/search-index.json) and searches it in the browser.
// Thai has no spaces between words, so matching is by substring: every word of
// the query must appear in the entry; title matches rank first. The query is
// kept in ?q= so results can be linked and the header's search box lands here.
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchDoc } from "./searchIndex";

const norm = (s: string) => s.normalize("NFC").toLowerCase();

function score(d: SearchDoc, terms: string[]): number {
  const t = norm(d.t), x = norm(d.x);
  let total = 0;
  for (const term of terms) {
    const inTitle = t.includes(term);
    const inText = x.includes(term);
    if (!inTitle && !inText) return 0;
    total += (inTitle ? 10 : 0) + Math.min(x.split(term).length - 1, 5);
  }
  return total;
}

/** A short passage around the first match, with every match marked. */
function Snippet({ text, terms }: { text: string; terms: string[] }) {
  const low = norm(text);
  const first = Math.min(...terms.map((t) => low.indexOf(t)).filter((i) => i >= 0));
  if (!isFinite(first)) return <>{text.slice(0, 180)}{text.length > 180 ? "…" : ""}</>;
  const start = Math.max(0, first - 70);
  const end = Math.min(text.length, first + 150);
  const part = text.slice(start, end);
  const re = new RegExp("(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return (
    <>
      {start > 0 && "…"}
      {part.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}
      {end < text.length && "…"}
    </>
  );
}

export default function Search({ locale }: { locale: "th" | "en" }) {
  const en = locale === "en";
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") || "";
    setQ(initial);
    if (!initial) input.current?.focus();
    fetch((en ? "/en" : "") + "/dgahub/search-index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setDocs)
      .catch(() => setFailed(true));
  }, [en]);

  // Keep the address in step with the query (no new history entry per keystroke).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }, [q]);

  const terms = useMemo(() => norm(q).split(/\s+/).filter(Boolean), [q]);
  const results = useMemo(() => {
    if (!docs || !terms.length) return [];
    return docs.map((d) => ({ d, s: score(d, terms) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 50);
  }, [docs, terms]);

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
