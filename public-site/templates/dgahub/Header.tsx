"use client";
// dgahub template header — the first prototype's design (dark top bar with
// owner + TH/EN switch, sticky white header with the DGA mark and the main
// menu). Menu items come from the tenant's WebX menu (Strapi menu-item).
// Below 1024px the menu collapses behind a toggle; Esc closes it. The search
// box sends ?q= to the search page (Search.tsx); on small screens it is an icon.
import { useEffect, useState } from "react";
import ThemeSwitch from "@/components/site/ThemeSwitch";

export type DgaNavLink = { label: string; href: string; current: boolean; newTab?: boolean };

export default function Header({ locale, siteName, owner, home, links, otherHref, searchHref }: {
  locale: "th" | "en"; siteName: string; owner: string; home: string; links: DgaNavLink[]; otherHref: string; searchHref: string;
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
          <div className="topbar-tools">
          <ThemeSwitch storageKey="dh-theme" locale={locale} className="theme-btn" />
          <nav aria-label={en ? "Language" : "เลือกภาษา"} className="lang">
            {(["th", "en"] as const).map((l) =>
              l === locale ? (
                <span key={l} aria-current="true" lang={l}>{l.toUpperCase()}</span>
              ) : (
                <a key={l} href={otherHref} lang={l} hrefLang={l}>{l.toUpperCase()}<span className="visually-hidden">{en ? " อ่านเป็นภาษาไทย" : " Read in English"}</span></a>
              ),
            )}
          </nav>
          </div>
        </div>
      </div>
      <header className="site-header">
        <div className="wrap">
          <a href={home} className="brand">
            <span className="brand-mark" aria-hidden="true">DGA</span>
            <span className="brand-name">{siteName}</span>
          </a>
          <form role="search" action={searchHref} method="get" className="dh-search">
            <label htmlFor="dh-search-q" className="visually-hidden">{en ? "Search this site" : "ค้นหาในเว็บไซต์"}</label>
            <input id="dh-search-q" name="q" type="search" placeholder={en ? "Search" : "ค้นหา"} />
            <button type="submit" aria-label={en ? "Search" : "ค้นหา"}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
          </form>
          <a href={searchHref} className="dh-search-link" aria-label={en ? "Search" : "ค้นหา"}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></a>
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
