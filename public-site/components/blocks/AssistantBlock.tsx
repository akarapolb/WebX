"use client";
// block.assistant — "ask this site" box. Calls Strapi's public, rate-limited
// POST /api/assist/ask, which answers only from this tenant's own published
// content and always returns the sources it used. With no LLM gateway
// configured it returns the best-matching passage instead (mode "extractive"),
// and says so, so a visitor never mistakes a quote for a generated answer.
import { useState, type FormEvent } from "react";
import { STRAPI } from "@/lib/useCaptcha";
import { t, type Locale } from "@/lib/i18n";

type Source = { n: number; kind: string; title: string; url: string | null };
type Answer = { answer: string | null; mode: "llm" | "extractive" | "none"; sources: Source[] };

export default function AssistantBlock({ b, tenant, locale }: { b: any; tenant: string; locale: Locale }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Answer | null>(null);
  const [err, setErr] = useState(false);
  const suggestions: string[] = Array.isArray(b.suggestions) ? b.suggestions.filter((s: unknown) => typeof s === "string").slice(0, 4) : [];
  const hid = "dh-ask-" + String(b.id ?? "x");

  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true); setErr(false); setRes(null);
    try {
      const r = await fetch(`${STRAPI}/api/assist/ask?tenant=${encodeURIComponent(tenant)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: question.slice(0, 400), locale }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setRes(await r.json());
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); ask(q); };

  return (
    <section className="block dh-block dh-ask" aria-labelledby={hid}>
      <div className="block__head"><div>
        <span className="eyebrow">{b.eyebrow || "AI · BETA"}</span>
        <h2 id={hid}>{b.title || t("askLabel", locale)}</h2>
        {b.intro && <p className="dh-intro">{b.intro}</p>}
      </div></div>
      <form className="dh-ask-form" role="search" onSubmit={submit}>
        <label htmlFor={hid + "-q"} className="visually-hidden">{t("askLabel", locale)}</label>
        <input id={hid + "-q"} className="input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={400}
          placeholder={b.placeholder || t("askLabel", locale)} autoComplete="off" />
        <button className="btn btn--primary" type="submit" disabled={busy}>{t("ask", locale)}</button>
      </form>
      {suggestions.length > 0 && (
        <p className="dh-suggest">
          {suggestions.map((s) => (
            <button key={s} type="button" className="btn btn--ghost" onClick={() => { setQ(s); ask(s); }}>{s}</button>
          ))}
        </p>
      )}
      <div aria-live="polite">
        {busy && <p className="dh-meta">{t("asking", locale)}</p>}
        {err && <p className="dh-meta" role="alert">{t("askError", locale)}</p>}
        {res && (
          <div className="dh-answer">
            {res.mode === "none" || !res.answer
              ? <p>{t("noAnswer", locale)}</p>
              : <>
                  {res.mode === "extractive" && <p className="dh-meta">{t("quoted", locale)}</p>}
                  <p className="dh-answer-text">{res.answer}</p>
                </>}
            {res.sources.length > 0 && (
              <>
                <h3 className="dh-sources-h">{t("sources", locale)}</h3>
                <ol className="dh-sources">
                  {res.sources.map((s) => (
                    <li key={s.n}>{s.url ? <a href={s.url}>{s.title}</a> : s.title}</li>
                  ))}
                </ol>
              </>
            )}
            {res.mode === "llm" && <p className="dh-meta">{b.disclaimer || t("aiNote", locale)}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
