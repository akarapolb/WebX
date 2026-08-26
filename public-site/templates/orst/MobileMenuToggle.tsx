"use client";

import { useState } from "react";

// The ONLY interactive slice of the ORST header carved out into a Client
// Component. Everything else in Header.tsx stays a Server Component.
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
export default function MobileMenuToggle() {
  const [open, setOpen] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    document.getElementById("mobile-menu")?.classList.toggle("is-open", next);
  }

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
