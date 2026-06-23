"use client";
import { useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";

type Result = { type?: string; title?: string; snippet?: string; url?: string };
type Source = { title?: string; type?: string; url?: string } | string;

const CHIPS_EN = ["How do I request a digital certificate?", "What is the EA standard?", "Where is the Open Data portal?"];
const CHIPS_TH = ["ขอใบรับรองดิจิทัลอย่างไร?", "มาตรฐาน EA คืออะไร?", "พอร์ทัล Open Data อยู่ที่ไหน?"];

export default function AISearch() {
  const { t, lang } = useLang();
  const { currentKey } = useTenant();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [ragOn, setRagOn] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [idxMsg, setIdxMsg] = useState("");

  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "dga";

  async function run(query: string) {
    const term = query.trim();
    if (!term) return;
    setQ(term); setLoading(true); setSearched(true); setAnswer(null); setSources([]); setResults([]); setRagOn(false);
    const base = "&locale=" + lang + "&tenant=" + encodeURIComponent(tenant);
    try {
      // 1) RAG: semantic, citation-grounded answer via the LLM-agnostic layer
      let rag: any = null;
      try {
        const rr = await fetch("/api/ai/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: term, tenant }) });
        if (rr.ok) rag = await rr.json();
      } catch {}
      if (rag?.answer) {
        setRagOn(true);
        setAnswer(rag.answer);
        setSources((rag.citations || []).map((c: any) => ({ title: c.title, url: c.url, type: String(c.contentType || "").replace(/^api::/, "").replace(/\..*$/, "") })));
        const sr = await fetch("/api/strapi/api/search?q=" + encodeURIComponent(term) + "&limit=10" + base).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        setResults(sr?.data ?? sr?.results ?? []);
        return;
      }
      // 2) fallback: keyword answer + search (works without AI configured)
      const [ar, sr] = await Promise.all([
        fetch("/api/strapi/api/ai/answer?q=" + encodeURIComponent(term) + base).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/strapi/api/search?q=" + encodeURIComponent(term) + "&limit=10" + base).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setAnswer(ar?.data?.answer ?? "");
      setSources(ar?.data?.sources ?? []);
      setResults(sr?.data ?? sr?.results ?? []);
    } finally { setLoading(false); }
  }

  async function reindex() {
    setIndexing(true); setIdxMsg("");
    try {
      const r = await fetch("/api/ai/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant }) });
      if (r.status === 503) setIdxMsg(t("s.aioff"));
      else if (r.ok) { const j = await r.json(); setIdxMsg(t("s.indexed").replace("{n}", String(j.indexed ?? 0))); }
      else setIdxMsg(t("ai.err"));
    } catch { setIdxMsg(t("ai.err")); }
    finally { setIndexing(false); }
  }

  const chips = lang === "th" ? CHIPS_TH : CHIPS_EN;
  const srcLabel = (s: Source) => (typeof s === "string" ? s : s.title || s.url || "—");

  return (
    <>
      <div className="vh"><div><h1>{t("nav.search")}</h1><p>{t("s.sub")}</p></div></div>

      <div className="ss-box">
        <input value={q} placeholder={t("s.ph")} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(q)} />
        <button className="btn btn--g" onClick={reindex} disabled={indexing} title={t("s.reindexhint")}>
          <Icon name="spark" />{indexing ? t("s.indexing") : t("s.reindex")}
        </button>
        <button className="btn btn--p" onClick={() => run(q)}><Icon name="search" />{t("s.btn")}</button>
      </div>
      {idxMsg && <div className="muted" style={{ fontSize: 12, margin: "-6px 0 8px" }}>{idxMsg}</div>}

      <div className="ss-chips">
        {chips.map((c) => <button key={c} className="ss-chip" onClick={() => run(c)}>{c}</button>)}
      </div>

      {!searched && <div className="muted" style={{ padding: 30, textAlign: "center" }}>{t("s.empty")}</div>}
      {loading && <div className="muted" style={{ padding: 20 }}>{t("s.thinking")}</div>}

      {searched && !loading && (
        <>
          {answer ? (
            <div className="ss-ans">
              <div className="ai-h"><Icon name="spark" />{ragOn ? t("s.aianswer") : t("s.kwanswer")}{ragOn && <span className="badge b-ok" style={{ marginLeft: 8 }}><span className="dot" />{t("s.grounded")}</span>}</div>
              <div className="txt">{answer}</div>
              {sources.length > 0 && (
                <div className="ss-src">
                  <span className="muted" style={{ alignSelf: "center" }}>{t("s.sources")}:</span>
                  {sources.map((s, i) => <span key={i} className="src"><Icon name="doc" />{srcLabel(s)}</span>)}
                </div>
              )}
            </div>
          ) : null}

          {results.length > 0 ? (
            <div className="panel" style={{ padding: "8px 0" }}>
              <div className="cmdk-g" style={{ paddingLeft: 18 }}>{t("s.results")}</div>
              <table className="tbl"><tbody>
                {results.map((r, i) => (
                  <tr className="row" key={i}>
                    <td><b>{r.title || "—"}</b>{r.snippet && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{r.snippet}</div>}</td>
                    <td style={{ textAlign: "right" }}><span className="badge b-acc">{r.type || "—"}</span></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ) : (!answer && <div className="muted" style={{ padding: 20, textAlign: "center" }}>{t("s.noresults")}</div>)}

          <div className="notice"><Icon name="code" /> {t("s.geo")}</div>
        </>
      )}
    </>
  );
}
