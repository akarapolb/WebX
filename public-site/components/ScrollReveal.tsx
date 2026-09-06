"use client";
// One shared IntersectionObserver for every tenant's `.reveal` elements
// (ORST/RoyalSociety's own base.css both key off this exact class — see
// their own "Motion + focus" sections). Mounted once, in the root layout, so
// it works across every tenant without each one standing up its own copy.
//
// Safety is enforced by CSS, not by this component: base.css's `.reveal`
// rule renders every such element at opacity:1 by default, and ONLY
// `html.js-reveal .reveal:not(.is-visible)` — a class app/layout.tsx's
// REVEAL_BOOT script adds synchronously in <head>, before paint, and never
// at all when the visitor prefers reduced motion — hides it first. If this
// component never mounts (JS blocked, an error, whatever), content already
// rendered at full opacity simply stays that way; there's no failure mode
// where a real visitor sees permanently-invisible content, the same
// constraint an earlier revision of this exact codebase already documented
// for both tenants' now-superseded inert ".reveal" hook.
import { useEffect } from "react";

export default function ScrollReveal() {
  useEffect(() => {
    if (!document.documentElement.classList.contains("js-reveal")) return;
    const els = document.querySelectorAll<HTMLElement>(".reveal:not(.is-visible)");
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
