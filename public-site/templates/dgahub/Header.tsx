"use client";
// dgahub template header — the first prototype's design (dark top bar with
// owner + TH/EN switch, sticky white header with the DGA mark and the main
// menu). Menu items come from the tenant's WebX menu (Strapi menu-item).
// Below 1024px the menu collapses behind a toggle; Esc closes it.
import { useEffect, useState } from "react";

export type DgaNavLink = { label: string; href: string; current: boolean; newTab?: boolean };

export default function Header({ locale, siteName, owner, home, links, otherHref }: {
  locale: "th" | "en"; siteName: string; owner: string; home: string; links: DgaNavLink[]; otherHref: string;
}) {
  const [open, setOpen] = useState(false);
  const en = locale === "en";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="topbar">
        <div className="wrap">
          <span>{owner}</span>
          <nav aria-label={en ? "Language" : "เลือกภาษา"} className="lang">
            {(["th", "en"] as const).map((l) =>
              l === locale ? (
                <span key={l} aria-current="true" lang={l}>{l.toUpperCase()}</span>
              ) : (
                <a key={l} href={otherHref} lang={l} hrefLang={l} aria-label={en ? "อ่านเป็นภาษาไทย" : "Read in English"}>{l.toUpperCase()}</a>
              ),
            )}
          </nav>
        </div>
      </div>
      <header className="site-header">
        <div className="wrap">
          <a href={home} className="brand" aria-label={siteName}>
            <span className="brand-mark" aria-hidden="true">DGA</span>
            <span className="brand-name">{siteName}</span>
          </a>
          <button className="nav-toggle" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen((o) => !o)}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            {en ? "Menu" : "เมนู"}
          </button>
          <nav id="main-nav" className="nav" data-open={open} aria-label={en ? "Main menu" : "เมนูหลัก"}>
            <ul>
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} aria-current={l.current ? "page" : undefined}
                    target={l.newTab ? "_blank" : undefined} rel={l.newTab ? "noopener noreferrer" : undefined}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
    </>
  );
}
