"use client";
import { useState } from "react";
import { jsonForScript } from "@/lib/sanitize";

// The original built this FAQPage JSON-LD client-side, after the CMS fetch
// resolved. Rendered directly into the static HTML here instead — a real
// AEO improvement, not just a rendering-model swap: answer engines see it
// in the initial payload rather than needing to run JS first.
export default function Faqs({ items }: { items: any[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items?.length) return null;

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
    <section className="block faq" aria-labelledby="faq-h">
      <div className="wrap">
        <div className="faq__head">
          <span className="eyebrow">ถาม–ตอบ</span>
          <h2 id="faq-h">คำถามที่พบบ่อย</h2>
        </div>
        <div className="faq-list">
          {items.map((f, i) => {
            const qid = "faq-q" + (i + 1), aid = "faq-a" + (i + 1);
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />
    </section>
  );
}
