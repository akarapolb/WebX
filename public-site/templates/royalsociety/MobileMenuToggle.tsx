"use client";

import { useEffect, useState } from "react";

// The ONLY interactive slice of the RoyalSociety header carved out into a
// Client Component — see the file-level comment in Header.tsx (point 3) for
// why. Everything else in Header.tsx stays a Server Component; this button
// and its effects are the sole piece that needs React state.
//
// Ported from 02-components.js's initMobileMenu(), which:
//   - toggled `#rs-mobile-panel`'s `hidden` attribute and `.is-open` class
//   - toggled the trigger's `aria-expanded`
//   - added/removed `body.mobile-menu-lock` (defined in 03-layout.css as
//     `overflow: hidden !important`, i.e. background-scroll lock)
//   - closed on: the "×" button (`[data-mobile-close]`), a click on the
//     panel backdrop itself, or the Escape key
//
// Simplifications versus the source's initMobileMenu(): the `hidden`
// attribute isn't toggled here — 03-layout.css's `.rs-mobile-panel` default
// state (`opacity:0;visibility:hidden;pointer-events:none`) already fully
// hides and un-tabs the closed panel, so `.is-open` alone reproduces the
// same visible/inert behavior without needing to juggle both. The focus trap
// (Tab wrapping inside the open drawer) and restoring focus to the
// previously-focused element on close are not reimplemented — Escape,
// backdrop-click, and the "×" button all still close the drawer.
export default function MobileMenuToggle() {
  const [open, setOpen] = useState(false);

  // Reflect `open` onto the statically-rendered panel/body (Header.tsx
  // renders #rs-mobile-panel; this component only toggles its state).
  useEffect(() => {
    const panel = document.getElementById("rs-mobile-panel");
    if (!panel) return;
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("mobile-menu-lock", open);
  }, [open]);

  // Wire up the close affordances that live inside the statically-rendered
  // panel markup (the "×" button and the backdrop itself), plus Escape.
  useEffect(() => {
    const panel = document.getElementById("rs-mobile-panel");
    if (!panel) return;

    const closeButton = panel.querySelector<HTMLElement>("[data-mobile-close]");

    function close() {
      setOpen(false);
    }
    function onPanelClick(event: MouseEvent) {
      if (event.target === panel) close();
    }
    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    panel.addEventListener("click", onPanelClick);
    closeButton?.addEventListener("click", close);
    document.addEventListener("keydown", onKeydown);

    return () => {
      panel.removeEventListener("click", onPanelClick);
      closeButton?.removeEventListener("click", close);
      document.removeEventListener("keydown", onKeydown);
    };
  }, []);

  return (
    <button
      className="mobile-toggle"
      type="button"
      data-mobile-open
      aria-label={open ? "ปิดเมนูหลัก" : "เปิดเมนูหลัก"}
      aria-expanded={open}
      aria-controls="rs-mobile-panel"
      onClick={() => setOpen((value) => !value)}
    >
      <span></span>
      <span></span>
      <span></span>
    </button>
  );
}
