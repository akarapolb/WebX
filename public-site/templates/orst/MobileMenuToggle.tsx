"use client";

import { useEffect, useLayoutEffect, useState } from "react";

// The ONLY interactive slice of the ORST header carved out into a Client
// Component (plus MegaNavClick.tsx). Everything else in Header.tsx stays a
// Server Component.
//
// Ported from components.js's initMobileMenu():
//   btn.addEventListener('click', () => {
//     const open = menu.classList.toggle('is-open');
//     btn.setAttribute('aria-expanded', String(open));
//   });
// Header.tsx server-renders the static <nav id="mobile-menu" class="mobile-menu">
// panel (closed, no "is-open" class) right next to this button. This button
// just reaches for that DOM node by id and toggles the same class the
// original vanilla JS did — same mechanism, just triggered from React state
// instead of a raw addEventListener, so the two pieces don't need to be
// nested inside one another (the button lives in .header-actions, the panel
// is a sibling of .header-inner — same layout as components.js produced).
//
// Fit-to-width: the inline nav used to appear at a fixed >=1600px breakpoint
// that assumed ~8 items. Editors can now add as many as they like, so the
// breakpoint can't know whether the items fit. This measures instead: it tries
// the inline layout, and if the items need more room than the nav has, the
// nav moves to its own row under the logo (`nav-wrap`); only when even that is
// too narrow does the header get `nav-collapsed` (hamburger + drawer) — items
// are never squeezed under the logo. Runs before paint and on every resize, so
// the header never shows a half-broken state. CSS (components.css) maps the
// three classes to what is shown; with no JS the old >=1600px rule still applies.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function MobileMenuToggle() {
  const [open, setOpen] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    document.getElementById("mobile-menu")?.classList.toggle("is-open", next);
  }

  useIsoLayoutEffect(() => {
    const header = document.getElementById("site-header");
    const nav = header?.querySelector<HTMLElement>(".main-nav");
    const inner = header?.querySelector<HTMLElement>(".header-inner");
    if (!header || !nav || !inner) return;

    // Roomiest layout that works, in this order: items beside the logo
    // ("nav-inline"); the same with tighter items and an icon-only search
    // button ("nav-inline nav-compact"); items on a row of their own under the
    // logo ("nav-wrap"); and only if even that is too narrow, the hamburger
    // drawer ("nav-collapsed").
    const ALL = ["nav-inline", "nav-compact", "nav-wrap", "nav-collapsed"];
    const TRIES = [["nav-inline"], ["nav-inline", "nav-compact"], ["nav-wrap"]];
    const fit = () => {
      const kids = Array.from(nav.children) as HTMLElement[];
      let chosen = ["nav-collapsed"];
      for (const classes of TRIES) {
        header.classList.remove(...ALL);
        header.classList.add(...classes);
        const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
        const needed = kids.reduce((sum, k) => sum + k.offsetWidth, 0) + gap * Math.max(0, kids.length - 1);
        if (kids.length > 0 && needed + 8 <= nav.clientWidth) { chosen = classes; break; }
      }
      header.classList.remove(...ALL);
      header.classList.add(...chosen);
      if (!chosen.includes("nav-collapsed")) {
        // The drawer is hidden outside collapsed mode — don't leave it flagged open.
        document.getElementById("mobile-menu")?.classList.remove("is-open");
        setOpen(false);
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(inner);
    // Web fonts change the items' widths once they load.
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, []);

  return (
    <button
      className="mobile-menu-btn"
      type="button"
      aria-expanded={open}
      aria-controls="mobile-menu"
      onClick={toggle}
    >
      <span></span>
      <span></span>
      <span></span>
      <span className="sr-only">เปิดเมนู</span>
    </button>
  );
}
