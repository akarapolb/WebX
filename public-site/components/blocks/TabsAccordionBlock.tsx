"use client";
// Generic tabs/accordion — one admin-authored item list, two possible
// display modes (b.layout). Accordion interaction is the same proven
// pattern as FaqBlock.tsx (single-open, aria-expanded/aria-controls/hidden),
// generalized from live FAQ data to admin-authored richtext panels.
import { useState } from "react";

export default function TabsAccordionBlock({ b }: { b: any }) {
  const items = Array.isArray(b.items) ? b.items : [];
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(0);
  if (!items.length) return null;

  if (b.layout === "accordion") {
    return (
      <section className="block tb-block" aria-label={b.heading || ""}>
        {b.heading && <h2 className="tb-heading">{b.heading}</h2>}
        <div className="tb-accordion">
          {items.map((it: any, i: number) => {
            const expanded = open === i;
            const qid = "tb-q" + i, aid = "tb-a" + i;
            return (
              <div className="tb-acc-item" key={i}>
                <h3 className="tb-acc-q">
                  <button type="button" className="tb-acc-btn" aria-expanded={expanded} aria-controls={aid} id={qid} onClick={() => setOpen(expanded ? null : i)}>
                    <span>{it.title}</span><span className="tb-acc-ic" aria-hidden="true" />
                  </button>
                </h3>
                <div className="tb-acc-a" id={aid} role="region" aria-labelledby={qid} hidden={!expanded}>
                  <div dangerouslySetInnerHTML={{ __html: it.body || "" }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="block tb-block" aria-label={b.heading || ""}>
      {b.heading && <h2 className="tb-heading">{b.heading}</h2>}
      <div className="tb-tabs">
        <div className="tb-tablist" role="tablist">
          {items.map((it: any, i: number) => (
            <button key={i} type="button" role="tab" id={"tb-tab" + i} aria-selected={active === i} aria-controls={"tb-panel" + i}
              className={"tb-tab" + (active === i ? " is-active" : "")} onClick={() => setActive(i)}>{it.title}</button>
          ))}
        </div>
        {items.map((it: any, i: number) => (
          <div key={i} role="tabpanel" id={"tb-panel" + i} aria-labelledby={"tb-tab" + i} className="tb-panel" hidden={active !== i}
            dangerouslySetInnerHTML={{ __html: it.body || "" }} />
        ))}
      </div>
    </section>
  );
}
