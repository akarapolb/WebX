"use client";
import { useState } from "react";

// Interactive piece of the "faq" block (see ../Blocks.tsx). In the source
// static site (assets/js/blocks.js `faq()` + assets/css/blocks.css
// `.faq-compact-list`), the button markup is rendered statically with
// aria-expanded="false"/hidden and a global click handler in components.js
// toggles it at runtime. Ported here as real client-side state instead of
// replicating the "static markup + external event binder" split, since
// React has no equivalent of that pattern — the resulting DOM/classes are
// identical, only the toggle is wired directly instead of via a global
// listener.
export default function FaqAccordion({ id, items }: { id?: string; items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="faq-compact-list">
      {items.map((it, i) => {
        const aid = `faq-a-${id || "x"}-${i}`;
        const expanded = open === i;
        return (
          <div className="faq-item" key={i}>
            <button
              className="faq-q"
              type="button"
              aria-expanded={expanded}
              aria-controls={aid}
              onClick={() => setOpen(expanded ? null : i)}
            >
              <span>{it.q}</span>
              <svg className="icon" aria-hidden="true">
                <use href="#i-chevron" />
              </svg>
            </button>
            <div className="faq-a" id={aid} hidden={!expanded}>
              <p>{it.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
