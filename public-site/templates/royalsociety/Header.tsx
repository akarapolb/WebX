import { Fragment } from "react";
import MobileMenuToggle from "./MobileMenuToggle";
import MobileSearchForm from "./MobileSearchForm";
import { RsIcon } from "./icons";

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
// Intentionally rendered inert (no onClick/behavior — matches source's own
// `data-*` hooks that 03-accessibility.js / a search modal would normally
// wire up, neither of which exists in this port):
//   - Topbar buttons ก-/ก/ก+/"ความคมชัด" and the "สำหรับผู้พิการทางสายตา" label.
//   - The "ค้นหา" (search) round button in header-actions.
//   - The mobile drawer's search `<input type="search">`.
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

type NavKey =
  | "home"
  | "about"
  | "knowledge"
  | "activities"
  | "publications"
  | "services"
  | "contact";

type NavItem = { key: NavKey; label: string; href: string };

type MegaGroup = readonly [heading: string, links: readonly string[]];

type MegaEntry = {
  kicker: string;
  title: string;
  desc: string;
  cta: string;
  groups: readonly MegaGroup[];
};

const NAV: readonly NavItem[] = [
  { key: "home", label: "หน้าหลัก", href: "/royalsociety" },
  { key: "about", label: "เกี่ยวกับราชบัณฑิตยสภา", href: "/royalsociety/about" },
  { key: "knowledge", label: "องค์ความรู้", href: "/royalsociety/knowledge" },
  { key: "activities", label: "งานวิชาการและกิจกรรม", href: "/royalsociety/activities" },
  { key: "publications", label: "สื่อและสิ่งพิมพ์", href: "/royalsociety/publications" },
  { key: "services", label: "บริการประชาชน", href: "/royalsociety/services" },
  { key: "contact", label: "ติดต่อเรา", href: "/royalsociety/contact" },
];

const MEGA: Partial<Record<NavKey, MegaEntry>> = {
  about: {
    kicker: "Institution",
    title: "เกี่ยวกับราชบัณฑิตยสภา",
    desc: "ทำความรู้จักประวัติ บทบาท โครงสร้าง และบุคลากรของราชบัณฑิตยสภา",
    cta: "ดูข้อมูลทั้งหมด",
    groups: [
      ["ข้อมูลองค์กร", ["ประวัติความเป็นมา", "ผู้บริหาร", "ราชบัณฑิตและภาคีสมาชิก", "โครงสร้างองค์กร"]],
      ["สำนักและระเบียบ", ["สำนักธรรมศาสตร์และการเมือง", "สำนักวิทยาศาสตร์", "สำนักศิลปกรรม", "กฎ ระเบียบ และข้อบังคับ"]],
    ],
  },
  knowledge: {
    kicker: "Knowledge",
    title: "องค์ความรู้",
    desc: "ค้นหาคลังความรู้ คำศัพท์ บทความ สารานุกรม และฐานข้อมูลวิชาการ",
    cta: "สำรวจองค์ความรู้",
    groups: [
      ["ค้นคว้าและฐานข้อมูล", ["คลังองค์ความรู้", "พจนานุกรมและคำศัพท์", "สารานุกรม", "ฐานข้อมูลวิชาการ"]],
      ["เนื้อหาแนะนำ", ["บทความวิชาการ", "องค์ความรู้สำหรับประชาชน", "ภาษาไทย", "ศิลปกรรมและวัฒนธรรม"]],
    ],
  },
  activities: {
    kicker: "Academic Activities",
    title: "งานวิชาการและกิจกรรม",
    desc: "ติดตามโครงการ การประชุม บรรยายวิชาการ และข่าวกิจกรรมล่าสุด",
    cta: "ดูงานวิชาการทั้งหมด",
    groups: [
      ["งานวิชาการ", ["โครงการและกิจกรรม", "การประชุมวิชาการ", "บรรยายวิชาการ", "รายงานประจำปี"]],
      ["ข่าวและประกาศ", ["ข่าวกิจกรรม", "ประกาศ", "ปฏิทินกิจกรรม", "กิจกรรมเผยแพร่ความรู้"]],
    ],
  },
  publications: {
    kicker: "Media & Publications",
    title: "สื่อและสิ่งพิมพ์",
    desc: "เลือกอ่าน ดาวน์โหลด และรับชมสื่อความรู้จากราชบัณฑิตยสภา",
    cta: "ดูสื่อทั้งหมด",
    groups: [
      ["สิ่งพิมพ์", ["E-Book", "หนังสือและตำรา", "วารสารราชบัณฑิตยสภา", "คลังเอกสาร"]],
      ["สื่อดิจิทัล", ["Infographic", "สื่อวิดีโอ", "สื่อเสียง", "เอกสารดาวน์โหลด"]],
    ],
  },
  services: {
    kicker: "Public Services",
    title: "บริการประชาชน",
    desc: "รวมช่องทางบริการและข้อมูลสำหรับประชาชน หน่วยงาน และผู้ใช้บริการทั่วไป",
    cta: "เริ่มใช้บริการ",
    groups: [
      ["บริการหลัก", ["สอบถามข้อมูลทางวิชาการ", "ขออนุญาตใช้เนื้อหา", "ดาวน์โหลดแบบฟอร์ม", "งานบริการออนไลน์"]],
      ["ช่องทางสนับสนุน", ["ติดต่อราชการ", "คำถามที่พบบ่อย", "รับข้อเสนอแนะ", "คู่มือการใช้งาน"]],
    ],
  },
};

const TOPBAR_LINKS: readonly { label: string; href: string }[] = [
  { label: "ติดต่อเรา", href: "/royalsociety/contact" },
  { label: "สำหรับเจ้าหน้าที่", href: "#" },
  { label: "ภาษา TH | EN", href: "#" },
  { label: "เข้าสู่ระบบ / สมัครสมาชิก", href: "#" },
];

const SITE = {
  name: "ราชบัณฑิตยสภา",
  logo: "/assets/royalsociety/images/logo-image.png",
  logoAlt: "ตราราชบัณฑิตยสภา",
};

export default function Header({ active }: { active?: string }) {
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

      <div className="topbar" role="region" aria-label="เครื่องมือช่วยการเข้าถึง">
        <div className="container topbar-inner">
          <div className="topbar-access">
            <a className="skip-link-inline" href="#main-content">ข้ามไปยังเนื้อหา</a>
            <span className="access-label">
              <RsIcon id="i-access" />
              สำหรับผู้พิการทางสายตา
            </span>
            <button className="top-tool" type="button" aria-label="ลดขนาดตัวอักษร">ก-</button>
            <button className="top-tool" type="button" aria-label="ขนาดตัวอักษรปกติ">ก</button>
            <button className="top-tool" type="button" aria-label="เพิ่มขนาดตัวอักษร">ก+</button>
            <button className="top-tool contrast-tool" type="button" aria-pressed={false}>ความคมชัด</button>
          </div>
          <div className="topbar-links">
            {TOPBAR_LINKS.map((item) => (
              <a href={item.href} key={item.label}>{item.label}</a>
            ))}
          </div>
        </div>
      </div>

      <header className="site-header" id="site-header">
        <div className="container header-inner">
          <a href="/royalsociety" className="brand" aria-label={`${SITE.name} หน้าหลัก`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-logo-img" src={SITE.logo} alt={SITE.logoAlt} loading="eager" />
            <span className="brand-text"><span className="brand-title">{SITE.name}</span></span>
          </a>

          <nav className="main-nav" aria-label="เมนูหลัก">
            {NAV.map((item) => {
              const isActive = item.key === active;
              const data = MEGA[item.key];
              const currentPage = isActive ? "page" : undefined;

              if (!data) {
                return (
                  <a
                    key={item.key}
                    className={isActive ? "active" : undefined}
                    href={item.href}
                    aria-current={currentPage}
                  >
                    {item.label}
                  </a>
                );
              }

              return (
                <Fragment key={item.key}>
                  <a
                    className={isActive ? "active" : undefined}
                    href={item.href}
                    data-mega={item.key}
                    aria-haspopup="true"
                    aria-current={currentPage}
                  >
                    <span>{item.label}</span>
                    <span className="nav-caret" aria-hidden="true">
                      <svg viewBox="0 0 20 20"><path d="M6 7.5 10 11.5 14 7.5"></path></svg>
                    </span>
                  </a>
                  <div className="mega-menu">
                    <div className="mega-inner">
                      <div className="mega-feature">
                        <small>{data.kicker}</small>
                        <h3>{data.title}</h3>
                        <p>{data.desc}</p>
                        <a href={item.href}>{data.cta} →</a>
                      </div>
                      <div className="mega-groups">
                        {data.groups.map(([heading, links]) => (
                          <div className="mega-group" key={heading}>
                            <h4>{heading}</h4>
                            {links.map((label) => (
                              <a href={item.href} key={label}>{label}</a>
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
            <button className="round-action search-action" type="button" aria-label="ค้นหาในเว็บไซต์">
              <RsIcon id="i-search" />
              <span>ค้นหา</span>
            </button>
            <a className="round-action primary" href="/royalsociety/services">บริการออนไลน์</a>
            <MobileMenuToggle />
          </div>
        </div>
      </header>

      <div className="rs-mobile-panel" id="rs-mobile-panel" aria-hidden="true">
        <div className="rs-mobile-drawer" role="dialog" aria-modal="true" aria-label="เมนูหลัก">
          <div className="rs-mobile-head">
            <strong>เมนูหลัก</strong>
            <button className="round-action" type="button" data-mobile-close aria-label="ปิดเมนู">
              <RsIcon id="i-x" />
            </button>
          </div>
          <MobileSearchForm />
          <div className="rs-mobile-acc">
            {NAV.map((item) => {
              const data = MEGA[item.key];

              if (!data) {
                return (
                  <a className="rs-mobile-direct" href={item.href} key={item.key}>
                    {item.label}<span>→</span>
                  </a>
                );
              }

              const flatLinks = data.groups.flatMap(([, links]) => links);

              return (
                <details key={item.key}>
                  <summary>
                    {item.label}
                    <RsIcon id="i-chevron" />
                  </summary>
                  <div className="rs-mobile-links">
                    {flatLinks.map((label) => (
                      <a href={item.href} key={label}>{label}</a>
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
