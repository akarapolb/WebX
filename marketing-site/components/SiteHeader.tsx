"use client";
import { useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { t, localePath, otherLocale, type Locale } from "@/lib/i18n";
import { SIGNUP_URL, LOGIN_URL } from "@/lib/config";

export default function SiteHeader({ locale, path }: { locale: Locale; path: "/" | "/pricing" }) {
  const s = t(locale);
  const [open, setOpen] = useState(false);
  const home = localePath(locale, "/");
  const hash = (h: string) => (home === "/" ? "/" : home + "/") + "#" + h;
  const links = [
    { href: hash("features"), l: s.nav.features },
    { href: hash("engines"), l: s.nav.engines },
    { href: hash("compliance"), l: s.nav.compliance },
    { href: localePath(locale, "/pricing"), l: s.nav.pricing },
  ];
  const alt = localePath(otherLocale(locale), path);

  return (
    <header className="hdr">
      <div className="wrap">
        <Link href={home} className="logo" aria-label="WebX">
          <span className="logo-mark">W</span>
          <span>WebX</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          {links.map((n) => <Link key={n.href} href={n.href}>{n.l}</Link>)}
        </nav>
        <div className="hdr-sp" />
        <div className="hdr-act">
          <Link href={alt} className="lang" hrefLang={otherLocale(locale)} aria-label={s.nav.langAria}>{s.nav.lang}</Link>
          <a href={LOGIN_URL} className="btn btn-g">{s.nav.signin}</a>
          <a href={SIGNUP_URL} className="btn btn-p">{s.nav.start}</a>
          <button className="burger" aria-expanded={open} aria-controls="mnav" aria-label={open ? s.nav.close : s.nav.menu} onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>
      <div id="mnav" className={"mnav" + (open ? " open" : "")}>
        {links.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>{n.l}</Link>)}
        <Link href={alt} hrefLang={otherLocale(locale)} onClick={() => setOpen(false)}>{s.nav.lang}</Link>
        <div className="mnav-act">
          <a href={LOGIN_URL} className="btn btn-g">{s.nav.signin}</a>
        </div>
      </div>
    </header>
  );
}
