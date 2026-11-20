"use client";
// Mobile menu for the gov-portal header (≤960px). home.css has always carried
// the full drawer design (.nav-toggle, .nav-backdrop, .drawer…, and it hides
// .main-nav and the header's .lang-switch at this width), but Header.tsx
// never rendered it — so on a phone a gov-portal site had no menu and no
// language switch at all. Keyboard: Esc closes, focus moves into the drawer
// on open and back to the toggle on close.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./IconSprite";
import type { Locale } from "@/lib/i18n";

type Link = { label: string; href: string; current?: boolean; newTab?: boolean };

export default function MobileNav({ links, langLinks, logo, logoAlt, home, locale }: {
  links: Link[]; langLinks: { label: string; href: string; lang: string; current: boolean }[];
  logo: string; logoAlt: string; home: string; locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  // The header establishes its own containing block (sticky + backdrop-filter),
  // which would trap a position:fixed drawer inside it; render it at <body>.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const L = locale === "en"
    ? { open: "Open menu", close: "Close menu", menu: "Menu" }
    : { open: "เปิดเมนู", close: "ปิดเมนู", menu: "เมนู" };

  useEffect(() => {
    document.body.classList.toggle("nav-open", open);
    if (!open) return;
    drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  return (
    <>
      <button ref={toggleRef} type="button" className="btn btn--ghost btn--icon nav-toggle" aria-expanded={open} aria-controls="webx-drawer"
        aria-label={open ? L.close : L.open} onClick={() => (open ? close() : setOpen(true))}>
        <Icon id={open ? "i-x" : "i-menu"} />
      </button>
      {mounted && createPortal(<>
      <div className={"nav-backdrop" + (open ? " open" : "")} onClick={close} aria-hidden="true" />
      <div ref={drawerRef} id="webx-drawer" className={"drawer" + (open ? " open" : "")} role="dialog" aria-modal="true" aria-label={L.menu}>
        <div className="drawer__head">
          <a href={home} aria-label={logoAlt}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src={logo} alt={logoAlt} width={124} height={38} />
          </a>
          <button type="button" className="btn btn--ghost btn--icon" aria-label={L.close} onClick={close}><Icon id="i-x" /></button>
        </div>
        <nav className="drawer__nav" aria-label={L.menu}>
          {links.map((l, i) => (
            <a key={i} className="drawer-link" href={l.href} aria-current={l.current ? "page" : undefined}
              target={l.newTab ? "_blank" : undefined} rel={l.newTab ? "noopener noreferrer" : undefined}>{l.label}</a>
          ))}
        </nav>
        <div className="drawer__foot">
          <span className="lang-switch">
            {langLinks.map((l) => (
              <a key={l.lang} href={l.href} lang={l.lang} hrefLang={l.lang} aria-current={l.current ? "true" : undefined}>{l.label}</a>
            ))}
          </span>
        </div>
      </div>
      </>, document.body)}
    </>
  );
}
