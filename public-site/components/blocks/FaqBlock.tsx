"use client";
// Direct port of components/Faqs.tsx's accordion + FAQPage JSON-LD onto
// block-driven framing config (eyebrow/title) — faqs still come from the
// live `homeData.faqs` fetch, not from the block's own record.
import { useState } from "react";

export default function FaqBlock({ faqs, eyebrow, title }: { faqs: any[]; eyebrow?: string; title?: string }) {
  const items = faqs || [];
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;

  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer || "" },
    })),
  };

  return (
    <section className="block faq" aria-labelledby="pgb-faq-h">
      <div className="wrap">
        <div className="faq__head">
          <span className="eyebrow">{eyebrow || "ถาม–ตอบ"}</span>
          <h2 id="pgb-faq-h">{title || "คำถามที่พบบ่อย"}</h2>
        </div>
        <div className="faq-list">
          {items.map((f, i) => {
            const qid = "pgb-faq-q" + (i + 1), aid = "pgb-faq-a" + (i + 1);
            const expanded = open === i;
            return (
              <div className="faq-item" key={f.documentId || i}>
                <h3 className="faq-q">
                  <button type="button" className="faq-btn" aria-expanded={expanded} aria-controls={aid} id={qid} onClick={() => setOpen(expanded ? null : i)}>
                    <span>{f.question}</span><span className="faq-ic" aria-hidden="true" />
                  </button>
                </h3>
                <div className="faq-a" id={aid} role="region" aria-labelledby={qid} hidden={!expanded}>
                  <div><p>{f.answer || ""}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </section>
  );
}
