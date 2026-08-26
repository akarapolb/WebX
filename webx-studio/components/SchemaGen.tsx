"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";

// Productizes Schema.org / JSON-LD (GEO/AEO) + meta into WebX: pick a content
// type + entry → generate the right structured data from its fields, optionally
// AI-write the meta description / answer block, preview, and copy.
type Entry = { documentId?: string; id?: number; title?: string; name?: string; question?: string; slug?: string; excerpt?: string; description?: string; answer?: string; body?: string; updatedAt?: string; publishDate?: string; categoryLabel?: string };
const TYPES = [
  { uid: "api::article.article", label: "Article → NewsArticle", schema: "NewsArticle" },
  { uid: "api::service.service", label: "Service → GovernmentService", schema: "GovernmentService" },
  { uid: "api::faq.faq", label: "FAQ → FAQPage", schema: "FAQPage" },
];
const stripHtml = (s: any) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const titleOf = (e: Entry) => e.title || e.name || e.question || "";

export default function SchemaGen() {
  const { t } = useLang();
  const [uid, setUid] = useState(TYPES[0].uid);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sel, setSel] = useState<string>("");
  const [base, setBase] = useState("https://www.dga.or.th");
  const [org, setOrg] = useState("สำนักงานพัฒนารัฐบาลดิจิทัล (สพร.)");
  const [jsonld, setJsonld] = useState("");
  const [meta, setMeta] = useState("");
  const [err, setErr] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const schema = TYPES.find((x) => x.uid === uid)!.schema;

  const load = useCallback(async () => {
    setErr(""); setEntries([]); setSel(""); setJsonld(""); setMeta("");
    try {
      const { data } = await cms.entries.list<Entry>(uid, { sort: "updatedAt:DESC", pageSize: 100, status: "published" });
      setEntries(data);
      if (schema !== "FAQPage" && data[0]) setSel(String(data[0].documentId ?? data[0].id));
    } catch (e) {
      if (e instanceof CmsError && e.status === 403) setErr(t("c.noPerm"));
      else if (e instanceof CmsError) setErr("Could not load entries (HTTP " + e.status + ").");
      else setErr("Cannot reach the backend.");
    }
  }, [uid, schema, t]);
  useEffect(() => { load(); }, [load]);

  const url = (e: Entry) => base.replace(/\/$/, "") + (schema === "NewsArticle" ? "/news/" : "/services/") + (e.slug || e.documentId || "");

  function build(): any {
    const publisher = { "@type": "GovernmentOrganization", name: org, logo: { "@type": "ImageObject", url: base.replace(/\/$/, "") + "/logo.png" } };
    if (schema === "FAQPage") {
      return {
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: entries.slice(0, 50).map((e) => ({ "@type": "Question", name: titleOf(e), acceptedAnswer: { "@type": "Answer", text: stripHtml(e.answer || e.description || e.body) } })),
      };
    }
    const e = entries.find((x) => String(x.documentId ?? x.id) === sel);
    if (!e) return null;
    if (schema === "NewsArticle") {
      return {
        "@context": "https://schema.org", "@type": "NewsArticle",
        headline: titleOf(e), description: meta || stripHtml(e.excerpt) || undefined,
        datePublished: e.publishDate || e.updatedAt, dateModified: e.updatedAt,
        articleSection: e.categoryLabel || undefined,
        author: publisher, publisher, mainEntityOfPage: url(e), inLanguage: "th",
      };
    }
    // GovernmentService
    return {
      "@context": "https://schema.org", "@type": "GovernmentService",
      name: titleOf(e), description: meta || stripHtml(e.description || e.excerpt) || undefined,
      serviceType: e.categoryLabel || "บริการดิจิทัลภาครัฐ", provider: publisher,
      areaServed: { "@type": "Country", name: "Thailand" },
      availableChannel: { "@type": "ServiceChannel", serviceUrl: url(e) }, inLanguage: "th",
    };
  }

  function generate() {
    const o = build();
    if (!o) { setErr(t("sg.pick")); return; }
    setErr("");
    setJsonld('<script type="application/ld+json">\n' + JSON.stringify(o, null, 2) + "\n</script>");
  }

  async function aiMeta() {
    const e = entries.find((x) => String(x.documentId ?? x.id) === sel);
    if (!e) { setErr(t("sg.pick")); return; }
    setAiBusy(true); setErr("");
    try {
      const r = await fetch("/api/ai/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "You write SEO/AEO meta descriptions for Thai government web content. Output ONLY a single meta description, 120–155 characters, in Thai, no quotes.",
          prompt: "Title: " + titleOf(e) + "\nContent: " + stripHtml(e.body || e.excerpt || e.description || e.answer).slice(0, 600),
          cache: true,
        }),
      });
      if (r.status === 503) { setErr(t("ai.off")); }
      else if (r.ok) { const txt = (await r.json()).text; if (typeof txt === "string") setMeta(txt.trim()); }
      else setErr(t("ai.err"));
    } catch { setErr(t("ai.err")); }
    finally { setAiBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(jsonld); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  const single = schema !== "FAQPage";

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.schema")}</h1><p>{t("sg.sub")}</p></div>
        <div className="vh-act"><button className="btn btn--g" onClick={load}><Icon name="undo" />{t("al.refresh")}</button></div>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span style={{ marginLeft: 10 }}>{err}</span></div>}

      <div className="panel" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 220px" }}><div className="muted" style={{ fontSize: 12 }}>{t("sg.type")}</div>
          <select className="vb-sel" style={{ width: "100%" }} value={uid} onChange={(e) => setUid(e.target.value)}>
            {TYPES.map((x) => <option key={x.uid} value={x.uid}>{x.label}</option>)}
          </select>
        </label>
        {single && (
          <label style={{ flex: "2 1 260px" }}><div className="muted" style={{ fontSize: 12 }}>{t("sg.entry")}</div>
            <select className="vb-sel" style={{ width: "100%" }} value={sel} onChange={(e) => setSel(e.target.value)}>
              {entries.map((e) => <option key={e.documentId ?? e.id} value={String(e.documentId ?? e.id)}>{titleOf(e).slice(0, 60)}</option>)}
            </select>
          </label>
        )}
        <label style={{ flex: "1 1 180px" }}><div className="muted" style={{ fontSize: 12 }}>{t("sg.base")}</div>
          <input className="rv-assignee" style={{ width: "100%" }} value={base} onChange={(e) => setBase(e.target.value)} />
        </label>
        <label style={{ flex: "1 1 180px" }}><div className="muted" style={{ fontSize: 12 }}>{t("sg.org")}</div>
          <input className="rv-assignee" style={{ width: "100%" }} value={org} onChange={(e) => setOrg(e.target.value)} />
        </label>
      </div>

      {single && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>{t("sg.meta")} <button className="btn btn--g" style={{ padding: "2px 8px" }} onClick={aiMeta} disabled={aiBusy}><Icon name="spark" />{aiBusy ? t("tr.translating") : t("sg.aimeta")}</button></div>
          <textarea className="rv-assignee" style={{ width: "100%", marginTop: 6, minHeight: 48 }} value={meta} onChange={(e) => setMeta(e.target.value)} placeholder={t("sg.metaph")} />
          <div className="muted" style={{ fontSize: 11 }}>{meta.length} {t("sg.chars")}{meta.length > 0 && (meta.length < 120 || meta.length > 155) ? " · " + t("sg.metahint") : ""}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, margin: "12px 0" }}>
        <button className="btn btn--p" onClick={generate}><Icon name="code" />{t("sg.gen")} {schema}</button>
        {jsonld && <button className="btn btn--g" onClick={copy}><Icon name="copy" />{copied ? t("sg.copied") : t("sg.copy")}</button>}
        {jsonld && <a className="btn btn--g" href="https://search.google.com/test/rich-results" target="_blank" rel="noreferrer"><Icon name="eye" />{t("sg.test")}</a>}
      </div>

      {jsonld && (
        <div className="panel">
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, fontFamily: "var(--mono, monospace)" }}>{jsonld}</pre>
        </div>
      )}

      <div className="notice" style={{ marginTop: 14 }}><Icon name="shield" /> {t("sg.foot")}</div>
    </>
  );
}
