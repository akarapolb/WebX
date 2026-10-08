import MobileMenuToggle from "./MobileMenuToggle";
import MegaNavClick from "./MegaNavClick";
import AccessibilityTools from "./AccessibilityTools";
import ThemeToggle from "./ThemeToggle";
import Picture from "@/components/Picture";
import { getCustomIcons, type NavItem, type NavMegaGroup, type NavMegaLink } from "@/lib/cms";
import { sanitizeIconSvg, safeViewBox } from "@/lib/iconSvg";

// Ported from ORST Website/assets/js/components.js — renderHeader(),
// renderDesktopNav(), renderMobileNav(), renderMegaMenu(), and the
// `icons` / navItems / megaMenuData data — as a static Server Component.
//
// Content (Thai copy, links, mega-menu groups) is copied verbatim from
// components.js's navItems/megaMenuData. The only structural changes from
// the original markup:
//
//   1. Mega menu: the original had ONE shared `#mega-menu` node whose innerHTML
//      was replaced and whose `hidden` attribute was toggled by JS on
//      mouseenter/focus/click (initMegaMenu()). A Server Component can't run
//      that JS, so instead every nav item with mega content renders its OWN
//      `.mega-menu` (wrapped in a new `.nav-mega-item` class, not present in
//      components.css, added purely for CSS scoping) and a small inline
//      <style> block reveals it on :hover/:focus-within. components.css
//      itself has no such hover-reveal rule (it only had `.mega-menu[hidden]`,
//      driven by JS), so this <style> block is a deliberate CSS-only
//      equivalent, still using only the existing components.css classes
//      (.mega-menu, .mega-inner, .mega-feature, .mega-groups, .mega-link, …)
//      for all visual styling. Consequence: `aria-expanded` on the trigger
//      link is omitted (can't be kept truthful without JS) — :hover /
//      :focus-visible still drive the existing nav-caret rotation styles.
//
//   2. Mobile submenu accordions: the original toggled a `.mobile-submenu
//      .is-open` class and swapped "+"/"−" text via initMobileMenu(). Here
//      they're native <details>/<summary> (zero JS, keyboard-operable out of
//      the box); a couple of small CSS rules in the same <style> block make
//      the open/closed rendering match the original panel styling and spin
//      the "+" into an "×" instead of swapping text for "−".
//
//   3. Mobile drawer open/close (the hamburger button) *does* need JS state
//      (there's no CSS-only way to reveal a full-width panel that isn't the
//      DOM sibling of a checkbox without extra markup contortions), so it's
//      the one piece pulled into MobileMenuToggle.tsx, a tiny Client
//      Component. Header itself stays a Server Component.
//
//   4. Topbar ก-/ก/ก+/"ความคมชัด" buttons — genuinely need client state (a
//      font-size attribute + a body class, both persisted), so they're
//      pulled into AccessibilityTools.tsx, sharing its logic with
//      RoyalSociety's own equivalent via lib/useAccessibilityToolbar.ts
//      (TOR gap audit — these rendered but had no onClick at all).
//      "สำหรับผู้พิการทางสายตา" is now a plain label (was a non-functional
//      `<button>`), matching RoyalSociety's own `.access-label` span.
//
//   5. Search round-button — used to open #search-modal (not part of this
//      port) and was left rendered inert. Now a plain link to a real
//      results page (app/orst/search) instead — see
//      templates/orst/SearchResults.tsx (TOR gap audit).
//
// Also intentionally NOT ported here (out of scope for header/nav/mega-menu
// porting, and meaningless without JS that doesn't exist yet in this repo):
//   - "สำหรับเจ้าหน้าที่" / "เข้าสู่ระบบ / สมัครสมาชิก": kept as "#"
//     placeholders exactly as components.js had them (no real target yet).
//
// Icons: this file has no <symbol> defs of its own — <OrstIconSprite/> is
// already mounted once in app/orst/layout.tsx and provides every id used
// below (i-eye, i-search, i-dictionary, i-book, i-ebook, i-megaphone,
// i-service, i-shield).
//
// Skip link: every app/orst/**/page.tsx already renders its own
// `<a className="skip-link" href="#main-content">` immediately before
// <Header/>, so this component does not render one itself (avoids a
// duplicate skip link per page).
//
// Route paths: components.js built links as `${basePath}xxx.html` (relative,
// flat multi-page-site paths). This template has its own dedicated route
// root (see lib/cms.ts's PublicTemplate — "app/orst" per the Phase 8 plan),
// so links here use clean `/orst/...` paths instead. Update these once the
// actual app/orst/* pages exist if the slugs end up different.

// Nav content (flat items + mega-menu dropdowns) now comes from the
// `navItems` prop — see lib/cms.ts's getNavItems/NavItem/NavMegaMenu and
// webx-studio's NavManager.tsx for the editor. This const is only a safety
// net for a not-yet-seeded environment, not a design to lean on (mirrors
// components/Header.tsx's FALLBACK_NAV for the same reason).
const FALLBACK_NAV: NavItem[] = [{ label: "หน้าหลัก", url: "/orst", openNewTab: false, order: 1 }];

// A nav item's "active" state used to be keyed by its hardcoded array
// position (["home", ...]); CMS rows have no such key, so `active` (still a
// route slug, e.g. "dictionary", passed by each app/orst/**/page.tsx) is
// compared against the URL an editor would realistically set for that page.
function hrefForActiveKey(key: string): string {
  return key === "home" ? "/orst" : "/orst/" + key;
}

// Bilingual EN (TOR gap — this header used to render a dead
// `<span>ภาษา TH | EN</span>` with no href at all). Only these 4 pages
// (home/about/contact/services) have a real English counterpart (see
// app/en/orst/*'s own comments for why the others are out of scope) — a nav
// link to any other page stays on its Thai URL even while browsing in
// English, rather than 404ing or guessing at a translation that doesn't
// exist. `active` is the same route-slug prop this file already threads
// through for nav-highlighting.
const BILINGUAL_SLUGS = new Set(["home", "about", "contact", "services"]);
function localizeHref(url: string, locale: "th" | "en"): string {
  if (locale !== "en" || !url.startsWith("/orst")) return url;
  const slug = url === "/orst" ? "home" : url.replace(/^\/orst\//, "");
  if (!BILINGUAL_SLUGS.has(slug)) return url;
  return url === "/orst" ? "/en/orst" : "/en" + url;
}
function toggleHref(active: string | undefined, locale: "th" | "en"): string {
  const slug = active && BILINGUAL_SLUGS.has(active) ? active : "home";
  const th = slug === "home" ? "/orst" : "/orst/" + slug;
  const en = slug === "home" ? "/en/orst" : "/en/orst/" + slug;
  return locale === "en" ? th : en;
}

const STR = {
  th: {
    a11y: "สำหรับผู้พิการทางสายตา", contact: "ติดต่อเรา", staff: "สำหรับเจ้าหน้าที่",
    login: "เข้าสู่ระบบ / สมัครสมาชิก", search: "ค้นหา", services: "บริการออนไลน์",
    mainNav: "เมนูหลัก", mobileNav: "เมนูมือถือ", homeAria: "สำนักงานราชบัณฑิตยสภา หน้าแรก",
  },
  en: {
    a11y: "Accessibility tools", contact: "Contact us", staff: "Staff login",
    login: "Sign in / Register", search: "Search", services: "Online services",
    mainNav: "Main menu", mobileNav: "Mobile menu", homeAria: "Office of the Royal Society home",
  },
} as const;

// Icon symbols (i-eye, i-search, i-dictionary, i-book, i-ebook, i-megaphone,
// i-service, i-shield) come from the global <OrstIconSprite/> already
// mounted once in app/orst/layout.tsx — no sprite defined in this file.
function Icon({ id, className = "icon" }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

// A group with more than a heading and links (icon / eyebrow / description /
// featured link) is drawn like the dropdown's own featured box — larger title.
function isRichGroup(g: NavMegaGroup): boolean {
  return !!(g.icon || g.eyebrow || g.description || g.featuredUrl);
}

// Unlimited-depth mega-menu links (TOR gap — the previous shape was
// hardcoded to exactly group→links, 2 levels). A link with no `children`
// renders exactly as before; one with children becomes a native
// <details>/<summary> disclosure nested inside the group — zero JS, same
// constraint as this file's existing hover/:focus-within mega-menu and
// <details> mobile accordion (see this file's own top comment, points 1-2).
function MegaLinkNode({ link, nodeKey }: { link: NavMegaLink; nodeKey: string }) {
  const children = link.children || [];
  if (!children.length) {
    return (
      <a className="mega-link" href={link.url}>
        <span>
          <strong>{link.text}</strong>
          <small>{link.desc || ""}</small>
        </span>
        <em aria-hidden="true">→</em>
      </a>
    );
  }
  return (
    <details className="mega-link-details">
      <summary className="mega-link">
        <span>
          <strong>{link.text}</strong>
          <small>{link.desc || ""}</small>
        </span>
        <em aria-hidden="true">›</em>
      </summary>
      <div className="mega-submenu">
        {children.map((child, i) => (
          <MegaLinkNode key={nodeKey + "-" + i} link={child} nodeKey={nodeKey + "-" + i} />
        ))}
      </div>
    </details>
  );
}

function MobileMegaLinkNode({ link, nodeKey }: { link: NavMegaLink; nodeKey: string }) {
  const children = link.children || [];
  if (!children.length) return <a href={link.url}>{link.text}</a>;
  return (
    <details className="mobile-submenu-nested">
      <summary>{link.text}</summary>
      <div className="mobile-submenu-nested-body">
        {children.map((child, i) => (
          <MobileMegaLinkNode key={nodeKey + "-" + i} link={child} nodeKey={nodeKey + "-" + i} />
        ))}
      </div>
    </details>
  );
}

// A dropdown's icon is either a sprite symbol id ("i-book") or the key of an icon
// the workspace saved (the Visual Builder's picker, incl. the Material set). A
// saved one is drawn from its stored definition, re-sanitised here rather than
// trusted from storage — same as the page blocks do.
type SavedIcon = { svg?: string; viewBox?: string; imageUrl?: string };
function NavIcon({ id, library, className = "icon" }: { id?: string; library: Record<string, SavedIcon>; className?: string }) {
  const def = id ? library[id] : undefined;
  if (def) {
    const safe = sanitizeIconSvg(def.svg);
    if (safe) {
      return <svg className={className} viewBox={safeViewBox(def.viewBox)} aria-hidden="true" style={{ fill: "currentColor", stroke: "none" }} dangerouslySetInnerHTML={{ __html: safe }} />;
    }
    if (def.imageUrl) return <img className={className} src={def.imageUrl} alt="" style={{ objectFit: "contain" }} />;
    return null;
  }
  return <Icon id={id || ""} className={className} />;
}

export default async function Header({ active, navItems, locale = "th" }: { active?: string; navItems?: NavItem[]; locale?: "th" | "en" }) {
  const nav = navItems && navItems.length ? navItems : FALLBACK_NAV;
  const savedIcons = await getCustomIcons("orst");
  const activeHref = active ? hrefForActiveKey(active) : "";
  const s = STR[locale];
  return (
    <>
      {/* The CSS-only equivalents this comment used to inline here (mega-menu
          show/hide on hover/focus-within, the accordion marker/rotation) now
          live in components.css alongside the rest of the header's styling —
          see its "mega menu" and "mobile menu drawer" sections. They used to
          ship as a <style> tag right here, which is *why* the Phase 11
          redesign's full-bleed mega-menu briefly rendered at ~180px wide
          instead of spanning the header: that inline block also forced
          `.nav-mega-item { position: relative }`, which made nav-mega-item
          (not .site-header) the mega-menu's containing block. Moved out and
          fixed rather than patched in place, so every rule governing this
          markup lives in one file. */}

      <div className="topbar">
        <div className="container topbar-inner">
          <div className="topbar-group">
            <span><Icon id="i-eye" /> {s.a11y}</span>
            <AccessibilityTools />
          </div>
          <div className="topbar-group topbar-right">
            <a href={localizeHref("/orst/contact", locale)}>{s.contact}</a>
            <a href="#">{s.staff}</a>
            <a href={toggleHref(active, locale)} lang={locale === "en" ? "th" : "en"}>
              {locale === "en" ? "TH" : "EN"}
            </a>
            <a href="#">{s.login}</a>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <header className="site-header" id="site-header">
        <div className="container header-inner">
          <a className="brand brand-image" href={locale === "en" ? "/en/orst" : "/orst"} aria-label={s.homeAria}>
            <Picture
              src="/assets/orst/images/logo.png"
              alt="สำนักงานราชบัณฑิตยสภา Office of the Royal Society"
              className="brand-logo"
            />
          </a>

          <nav className="main-nav" aria-label={s.mainNav}>
            {nav.map((n, i) => {
              const data = n.megaMenu;
              const isActive = !!activeHref && n.url === activeHref;
              const href = localizeHref(n.url, locale);
              const linkProps = { target: n.openNewTab ? "_blank" : undefined, rel: n.openNewTab ? "noopener noreferrer" : undefined };

              if (!data) {
                return (
                  <a key={i} className={isActive ? "active" : undefined} href={href} {...linkProps}>
                    {n.label}
                  </a>
                );
              }

              return (
                <div className="nav-mega-item" key={i}>
                  <a
                    className={isActive ? "active" : undefined}
                    href={href}
                    data-mega={i}
                    aria-haspopup="true"
                    aria-expanded="false"
                    {...linkProps}
                  >
                    {n.label}
                    <span className="nav-caret" aria-hidden="true">
                      <svg viewBox="0 0 20 20">
                        <path d="M5.5 7.5 10 12l4.5-4.5"></path>
                      </svg>
                    </span>
                  </a>
                  <div className="mega-menu">
                    <div className="mega-inner" role="region" aria-label={`เมนูย่อย ${data.title || n.label}`}>
                      <div className="mega-feature">
                        <span className="mega-feature-icon">
                          <NavIcon id={data.icon} library={savedIcons} className="icon-lg" />
                        </span>
                        <span className="section-kicker">{data.eyebrow}</span>
                        <h3>{data.title}</h3>
                        <p>{data.description}</p>
                        {data.featuredUrl && (
                          <a href={data.featuredUrl}>
                            {data.featuredLabel || n.label} <span aria-hidden="true">→</span>
                          </a>
                        )}
                      </div>
                      <div className="mega-groups">
                        {data.groups.map((group, gi) => (
                          <div className={"mega-group" + (isRichGroup(group) ? " is-rich" : "")} key={gi}>
                            {isRichGroup(group) && (
                              <>
                                {/* Same icon tile and eyebrow rule as the featured box beside it —
                                    shown even when still empty, so the boxes line up. */}
                                <span className="mega-feature-icon">
                                  <NavIcon id={group.icon} library={savedIcons} className="icon-lg" />
                                </span>
                                <span className="section-kicker">{group.eyebrow}</span>
                              </>
                            )}
                            {group.heading && <h4>{group.heading}</h4>}
                            {group.description && <p className="mega-group-desc">{group.description}</p>}
                            {group.featuredUrl && (
                              <a className="mega-group-cta" href={group.featuredUrl}>
                                {group.featuredLabel || group.heading || group.featuredUrl} <span aria-hidden="true">→</span>
                              </a>
                            )}
                            {group.links.map((l, li) => (
                              <MegaLinkNode key={li} link={l} nodeKey={`${i}-${gi}-${li}`} />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="header-actions">
            <a className="round-btn" href="/orst/search" aria-label={s.search}>
              <Icon id="i-search" /> <span>{s.search}</span>
            </a>
            <a className="round-btn primary" href={localizeHref("/orst/services", locale)}>{s.services}</a>
            <MobileMenuToggle />
            <MegaNavClick />
          </div>
        </div>

        <nav id="mobile-menu" className="mobile-menu" aria-label={s.mobileNav}>
          {nav.map((n, i) => {
            const data = n.megaMenu;
            const isActive = !!activeHref && n.url === activeHref;
            const href = localizeHref(n.url, locale);

            if (!data) {
              return (
                <a key={i} className={"mobile-link" + (isActive ? " active" : "")} href={href}
                  target={n.openNewTab ? "_blank" : undefined} rel={n.openNewTab ? "noopener noreferrer" : undefined}>
                  {n.label}<span>›</span>
                </a>
              );
            }

            return (
              <details className="mobile-nav-group" key={i}>
                <summary className="mobile-accordion-btn">
                  <span>{n.label}</span><span aria-hidden="true">+</span>
                </summary>
                <div className="mobile-submenu">
                  {data.featuredUrl && <a href={data.featuredUrl}><strong>{data.featuredLabel || n.label}</strong></a>}
                  {data.groups.map((group, gi) => (
                    <div className="mobile-submenu-group" key={gi}>
                      {group.heading && <strong>{group.heading}</strong>}
                      {group.description && <small>{group.description}</small>}
                      {group.featuredUrl && <a href={group.featuredUrl}><strong>{group.featuredLabel || group.heading || group.featuredUrl}</strong></a>}
                      {group.links.map((l, li) => (
                        <MobileMegaLinkNode key={li} link={l} nodeKey={`m-${i}-${gi}-${li}`} />
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </nav>
      </header>
    </>
  );
}
