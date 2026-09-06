import { Fragment } from "react";
import MobileMenuToggle from "./MobileMenuToggle";
import MobileSearchForm from "./MobileSearchForm";
import AccessibilityTools from "./AccessibilityTools";
import ThemeToggle from "./ThemeToggle";
import { RsIcon } from "./icons";
import Picture from "@/components/Picture";
import type { NavItem as CmsNavItem, NavMegaLink } from "@/lib/cms";

// Ported from RoyalSociety source's assets/js/01-config.js (window.RS_CONFIG:
// site/contact/topbarLinks/nav/mega/footer) + assets/js/02-components.js
// (renderHeader(), renderTopbar(), renderNav(), renderMega(),
// renderMobilePanel() — all string-template functions that built
// `#app-header`'s innerHTML at runtime). Thai copy, hrefs-as-written and the
// mega-menu group data below are copied verbatim from 01-config.js.
//
// Structural differences from the source, and why:
//
//   1. `id="app-header"` wrapper. In the static site, `<div id="app-header">`
//      was an empty placeholder in each page's HTML that 02-components.js
//      filled via `.innerHTML =`. Almost all of the header's real visual
//      styling in 03-layout.css lives behind `#app-header ...` prefixed
//      selectors (topbar padding, header-inner grid-template-columns, brand
//      sizing, nav link clamp() sizing, mega-menu positioning, mobile-toggle,
//      etc. — several overlapping revisions of the same rules, all scoped
//      under `#app-header`). Dropping that id would silently fall back to
//      the earlier/unscoped versions of these rules and look wrong, so this
//      component's root is `<div id="app-header">` instead of a fragment.
//
//   2. Mega menu: the source had ONE shared `<div class="mega-menu"
//      id="mega-menu" hidden>` node whose innerHTML was replaced and whose
//      `hidden` attribute was toggled by initMegaMenu() on
//      mouseenter/focus/click/Escape/outside-click — genuinely JS-driven,
//      not CSS :hover-revealed (03-layout.css only has
//      `.mega-menu[hidden]{display:none}`, no hover rule). A Server
//      Component can't run that JS, so instead every nav item with mega data
//      renders its OWN `.mega-menu`, as a sibling of its trigger `<a>` (both
//      still direct children of `.main-nav`, so the existing
//      `.main-nav>a` / `.main-nav>a:hover` box/caret-rotation rules keep
//      applying to the trigger unchanged — no wrapper element was needed and
//      no new class name was invented). A small inline <style> block adds
//      the CSS-only reveal:
//        .main-nav > .mega-menu { display: none; }
//        .main-nave... :hover / :focus / :focus-within -> display: block;
//      `.mega-menu` keeps its `position:absolute` from 03-layout.css, which
//      anchors to `.site-header` (the nearest positioned ancestor per
//      `#app-header .site-header{position:relative!important}`), so it still
//      centers under the whole header exactly like the original shared node
//      did — not under the individual nav item. Consequence: `aria-expanded`
//      on the trigger is omitted (can't stay truthful without JS); the
//      existing `:hover`/`:focus` rules already drive the nav-caret rotation
//      and background highlight, so nothing else is lost visually.
//
//   3. Mobile drawer (`.rs-mobile-panel`, hamburger open, "×" close,
//      backdrop click, Escape) genuinely needs JS state — there's no
//      CSS-only way to toggle a full-screen panel driven by three separate
//      triggers (open button, close button, backdrop, Escape key). That
//      logic is the one piece pulled into MobileMenuToggle.tsx, a small
//      Client Component that renders the hamburger button itself and wires
//      up the rest via DOM lookups against the ids/attributes this file
//      still renders statically (`#rs-mobile-panel`, `[data-mobile-close]`).
//      Header itself stays a Server Component. The mobile accordion inside
//      the drawer needs no JS at all — the source already used native
//      `<details>/<summary>`, ported as-is.
//
//   4. Topbar ก-/ก/ก+/"ความคมชัด" buttons — same reasoning as point 3 (real
//      client state: font-size attribute + a body class, both persisted).
//      Pulled into AccessibilityTools.tsx, sharing its state logic with
//      ORST's own equivalent controls via lib/useAccessibilityToolbar.ts
//      (TOR gap audit — these rendered with correct ARIA labels but no
//      onClick at all).
//
//   5. The "ค้นหา" (search) round button and the mobile drawer's search
//      input — both used to open/submit to a search modal/results page
//      that didn't exist in this port. Now real: the round button links to
//      a results page (app/royalsociety/search), and MobileSearchForm.tsx
//      submits there too instead of its old fallback redirect to
//      /royalsociety/knowledge — see templates/royalsociety/SearchResults.tsx
//      (TOR gap audit).
//
// Intentionally rendered inert (no onClick/behavior — matches source's own
// `data-*` hooks that 03-accessibility.js would normally wire up, which
// doesn't exist in this port):
//   - "สำหรับเจ้าหน้าที่" / "ภาษา TH | EN" / "เข้าสู่ระบบ / สมัครสมาชิก" — kept
//     as "#" placeholders exactly as 01-config.js had them.
//
// Route paths: the source built `${base}pages/xxx.html` (relative,
// multi-page-site paths, with `../` prepended under /pages/). This app has
// its own route tree at /royalsociety, so links here use `/royalsociety` and
// `/royalsociety/{key}` instead — `key` matches nav item keys 1:1 with the
// PAGES list in app/royalsociety/[page]/page.tsx.
//
// Mega-menu sub-links: every group link in 01-config.js's `mega` data is a
// plain string (no page-specific `{label, href}` object anywhere in the
// config yet — the config's own comment marks this as a TODO for when real
// subpages exist), so every sub-link in a given mega panel points at that
// same section's page, exactly as renderMega()'s normalizeLink() fallback
// did. The trailing arrow character on `.mega-group a` is drawn by
// `.mega-group a:after { content: "→" }` in 03-layout.css, so link labels
// below carry no arrow text of their own (adding one would double it up).

// Nav content (flat items + mega-menu dropdowns) now comes from the
// `navItems` prop — see lib/cms.ts's getNavItems/NavItem/NavMegaMenu and
// webx-studio's NavManager.tsx for the editor, and strapi-cms's
// seed-royalsociety-nav.mjs for the one-off migration of this file's
// original NAV/MEGA constants into that content type. This const is only a
// safety net for a not-yet-seeded environment (mirrors ORST Header.tsx's
// identical FALLBACK_NAV).
const FALLBACK_NAV: CmsNavItem[] = [{ label: "หน้าหลัก", url: "/royalsociety", openNewTab: false, order: 1 }];

// `active` (a route slug, e.g. "about") is compared against the URL an
// editor would realistically set for that nav item — see ORST Header.tsx's
// identical hrefForActiveKey for why (CMS rows have no stable "key" field).
function hrefForActiveKey(key: string): string {
  return key === "home" ? "/royalsociety" : "/royalsociety/" + key;
}

// Bilingual EN (TOR gap — TOPBAR_LINKS' "ภาษา TH | EN" used to be a dead
// "#" placeholder). Only these 4 pages have a real English counterpart —
// see app/en/royalsociety/*'s own comments for why the rest stay Thai-only.
// A nav link to any other page keeps its Thai URL even while browsing in
// English, rather than 404ing or guessing at a translation that doesn't exist.
const BILINGUAL_SLUGS = new Set(["home", "about", "contact", "services"]);
function localizeHref(url: string, locale: "th" | "en"): string {
  if (locale !== "en" || !url.startsWith("/royalsociety")) return url;
  const slug = url === "/royalsociety" ? "home" : url.replace(/^\/royalsociety\//, "");
  if (!BILINGUAL_SLUGS.has(slug)) return url;
  return url === "/royalsociety" ? "/en/royalsociety" : "/en" + url;
}
function toggleHref(active: string | undefined, locale: "th" | "en"): string {
  const slug = active && BILINGUAL_SLUGS.has(active) ? active : "home";
  const th = slug === "home" ? "/royalsociety" : "/royalsociety/" + slug;
  const en = slug === "home" ? "/en/royalsociety" : "/en/royalsociety/" + slug;
  return locale === "en" ? th : en;
}

const STR = {
  th: { a11y: "สำหรับผู้พิการทางสายตา", mainNav: "เมนูหลัก", search: "ค้นหา", services: "บริการออนไลน์", searchAria: "ค้นหาในเว็บไซต์", mobileMenuAria: "เมนูหลัก", closeAria: "ปิดเมนู" },
  en: { a11y: "Accessibility tools", mainNav: "Main menu", search: "Search", services: "Online services", searchAria: "Search the website", mobileMenuAria: "Main menu", closeAria: "Close menu" },
} as const;

// Unlimited-depth mega-menu links (TOR gap — the previous shape was
// hardcoded to exactly group→links, 2 levels; see public-site/lib/cms.ts's
// NavMegaLink comment). A link with no `children` renders exactly as
// before (a plain <a>); one with children becomes a native
// <details>/<summary> disclosure — zero JS, matching this component's own
// existing CSS-only mega-menu (hover/:focus-within) and mobile accordion.
function MegaLinkNode({ link, fallbackHref, nodeKey }: { link: NavMegaLink; fallbackHref: string; nodeKey: string }) {
  const children = link.children || [];
  if (!children.length) return <a href={link.url || fallbackHref}>{link.text}</a>;
  return (
    <details className="mega-link-details">
      <summary>{link.text}</summary>
      <div className="mega-submenu">
        {children.map((child, i) => (
          <MegaLinkNode key={nodeKey + "-" + i} link={child} fallbackHref={fallbackHref} nodeKey={nodeKey + "-" + i} />
        ))}
      </div>
    </details>
  );
}

function MobileMegaLinkNode({ link, fallbackHref, nodeKey }: { link: NavMegaLink; fallbackHref: string; nodeKey: string }) {
  const children = link.children || [];
  if (!children.length) return <a href={link.url || fallbackHref}>{link.text}</a>;
  return (
    <details className="rs-mobile-links-nested">
      <summary>{link.text}</summary>
      <div>
        {children.map((child, i) => (
          <MobileMegaLinkNode key={nodeKey + "-" + i} link={child} fallbackHref={fallbackHref} nodeKey={nodeKey + "-" + i} />
        ))}
      </div>
    </details>
  );
}

function topbarLinks(locale: "th" | "en", active: string | undefined): readonly { label: string; href: string; hrefLang?: string }[] {
  return locale === "en"
    ? [
        { label: "Contact us", href: localizeHref("/royalsociety/contact", locale) },
        { label: "Staff login", href: "#" },
        { label: "TH", href: toggleHref(active, locale), hrefLang: "th" },
        { label: "Sign in / Register", href: "#" },
      ]
    : [
        { label: "ติดต่อเรา", href: "/royalsociety/contact" },
        { label: "สำหรับเจ้าหน้าที่", href: "#" },
        { label: "EN", href: toggleHref(active, locale), hrefLang: "en" },
        { label: "เข้าสู่ระบบ / สมัครสมาชิก", href: "#" },
      ];
}

const SITE = {
  name: "ราชบัณฑิตยสภา",
  logo: "/assets/royalsociety/images/logo-image.png",
  logoAlt: "ตราราชบัณฑิตยสภา",
};

export default function Header({ active, navItems, locale = "th" }: { active?: string; navItems?: CmsNavItem[]; locale?: "th" | "en" }) {
  const nav = navItems && navItems.length ? navItems : FALLBACK_NAV;
  const activeHref = active ? hrefForActiveKey(active) : "";
  const s = STR[locale];
  return (
    <div id="app-header">
      {/* CSS-only equivalent of components.js's mouseenter/focus/click-driven
          mega-menu reveal — see file-level comment #2 above. */}
      <style>{`
        .main-nav > .mega-menu { display: none; }
        .main-nav > a[data-mega]:hover + .mega-menu,
        .main-nav > a[data-mega]:focus + .mega-menu,
        .main-nav > .mega-menu:hover,
        .main-nav > .mega-menu:focus-within {
          display: block;
        }
      `}</style>

      <div className="topbar" role="region" aria-label={s.a11y}>
        <div className="container topbar-inner">
          <div className="topbar-access">
            <a className="skip-link-inline" href="#main-content">{locale === "en" ? "Skip to content" : "ข้ามไปยังเนื้อหา"}</a>
            <span className="access-label">
              <RsIcon id="i-access" />
              {s.a11y}
            </span>
            <AccessibilityTools />
          </div>
          <div className="topbar-links">
            {topbarLinks(locale, active).map((item) => (
              <a href={item.href} lang={item.hrefLang} key={item.label}>{item.label}</a>
            ))}
            <ThemeToggle />
          </div>
        </div>
      </div>

      <header className="site-header" id="site-header">
        <div className="container header-inner">
          <a href={locale === "en" ? "/en/royalsociety" : "/royalsociety"} className="brand" aria-label={locale === "en" ? `${SITE.name} home` : `${SITE.name} หน้าหลัก`}>
            <Picture className="brand-logo-img" src={SITE.logo} alt={SITE.logoAlt} loading="eager" />
            <span className="brand-text"><span className="brand-title">{SITE.name}</span></span>
          </a>

          <nav className="main-nav" aria-label={s.mainNav}>
            {nav.map((n, i) => {
              const isActive = !!activeHref && n.url === activeHref;
              const data = n.megaMenu;
              const currentPage = isActive ? "page" : undefined;
              const href = localizeHref(n.url, locale);
              const linkProps = { target: n.openNewTab ? "_blank" : undefined, rel: n.openNewTab ? "noopener noreferrer" : undefined };

              if (!data) {
                return (
                  <a key={i} className={isActive ? "active" : undefined} href={href} aria-current={currentPage} {...linkProps}>
                    {n.label}
                  </a>
                );
              }

              return (
                <Fragment key={i}>
                  <a
                    className={isActive ? "active" : undefined}
                    href={href}
                    data-mega={i}
                    aria-haspopup="true"
                    aria-current={currentPage}
                    {...linkProps}
                  >
                    <span>{n.label}</span>
                    <span className="nav-caret" aria-hidden="true">
                      <svg viewBox="0 0 20 20"><path d="M6 7.5 10 11.5 14 7.5"></path></svg>
                    </span>
                  </a>
                  <div className="mega-menu">
                    <div className="mega-inner">
                      <div className="mega-feature">
                        {data.eyebrow ? <small>{data.eyebrow}</small> : null}
                        <h3>{data.title || n.label}</h3>
                        {data.description ? <p>{data.description}</p> : null}
                        {data.featuredUrl ? <a href={data.featuredUrl}>{data.featuredLabel} →</a> : null}
                      </div>
                      <div className="mega-groups">
                        {data.groups.map((group, gi) => (
                          <div className="mega-group" key={gi}>
                            <h4>{group.heading}</h4>
                            {group.links.map((l, li) => (
                              <MegaLinkNode key={li} link={l} fallbackHref={n.url} nodeKey={`${i}-${gi}-${li}`} />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </nav>

          <div className="header-actions">
            <a className="round-action search-action" href="/royalsociety/search" aria-label={s.searchAria}>
              <RsIcon id="i-search" />
              <span>{s.search}</span>
            </a>
            <a className="round-action primary" href={localizeHref("/royalsociety/services", locale)}>{s.services}</a>
            <MobileMenuToggle />
          </div>
        </div>
      </header>

      <div className="rs-mobile-panel" id="rs-mobile-panel" aria-hidden="true">
        <div className="rs-mobile-drawer" role="dialog" aria-modal="true" aria-label={s.mobileMenuAria}>
          <div className="rs-mobile-head">
            <strong>{s.mainNav}</strong>
            <button className="round-action" type="button" data-mobile-close aria-label={s.closeAria}>
              <RsIcon id="i-x" />
            </button>
          </div>
          <MobileSearchForm />
          <div className="rs-mobile-acc">
            {nav.map((n, i) => {
              const data = n.megaMenu;
              const href = localizeHref(n.url, locale);

              if (!data) {
                return (
                  <a className="rs-mobile-direct" href={href} key={i}>
                    {n.label}<span>→</span>
                  </a>
                );
              }

              const flatLinks = data.groups.flatMap((g) => g.links);

              return (
                <details key={i}>
                  <summary>
                    {n.label}
                    <RsIcon id="i-chevron" />
                  </summary>
                  <div className="rs-mobile-links">
                    {flatLinks.map((l, li) => (
                      <MobileMegaLinkNode key={li} link={l} fallbackHref={href} nodeKey={`m-${i}-${li}`} />
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
