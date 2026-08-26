import MobileMenuToggle from "./MobileMenuToggle";

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
// Also intentionally NOT ported here (out of scope for header/nav/mega-menu
// porting, and meaningless without JS that doesn't exist yet in this repo):
//   - Topbar accessibility buttons (ก+/ก-/ก, "ความคมชัด") and the
//     "สำหรับผู้พิการทางสายตา" button: rendered inert (no onClick) — they
//     mirror initSharedAccessibility() in components.js, not built here.
//   - The search round-button (data-open-search): rendered inert — it used
//     to open #search-modal, which isn't part of this port.
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

type NavEntry = readonly [key: string, label: string, href: string];
type MegaGroupLink = readonly [text: string, url: string, desc?: string];
type MegaGroup = { heading: string; links: readonly MegaGroupLink[] };
type MegaMenuEntry = {
  title: string;
  eyebrow: string;
  description: string;
  icon: string;
  featured: readonly [label: string, url: string];
  groups: readonly MegaGroup[];
};

const navItems: readonly NavEntry[] = [
  ["home", "หน้าหลัก", "/orst"],
  ["dictionary", "พจนานุกรมและคำศัพท์", "/orst/dictionary"],
  ["knowledge", "องค์ความรู้", "/orst/knowledge"],
  ["publications", "สื่อและสิ่งพิมพ์", "/orst/publications"],
  ["news", "ข่าวสารและกิจกรรม", "/orst/news"],
  ["services", "บริการประชาชน", "/orst/services"],
  ["about", "เกี่ยวกับเรา", "/orst/about"],
  ["contact", "ติดต่อเรา", "/orst/contact"],
];

const megaMenuData: Record<string, MegaMenuEntry> = {
  dictionary: {
    title: "พจนานุกรมและคำศัพท์",
    eyebrow: "Language Services",
    description: "ค้นคำศัพท์ ความหมาย ศัพท์บัญญัติ และหลักเกณฑ์การใช้ภาษาไทยจากแหล่งข้อมูลเดียว",
    icon: "i-dictionary",
    featured: ["เปิดพจนานุกรมออนไลน์", "/orst/dictionary"],
    groups: [
      {
        heading: "บริการคำศัพท์",
        links: [
          ["พจนานุกรมออนไลน์", "/orst/dictionary", "ค้นความหมายและการใช้คำ"],
          ["ศัพท์บัญญัติ", "#", "ศัพท์เฉพาะทางและคำมาตรฐาน"],
          ["ค้นคำศัพท์ภาษาไทย", "#", "ค้นหาคำตามหมวดและคำใกล้เคียง"],
        ],
      },
      {
        heading: "ฐานข้อมูลที่เกี่ยวข้อง",
        links: [
          ["สารานุกรมและอนุกรมวิธาน", "#", "คลังความรู้และหมวดคำ"],
          ["หลักเกณฑ์การใช้ภาษา", "#", "แนวทางการเขียนและการใช้ภาษา"],
          ["คำถามที่พบบ่อยด้านภาษา", "#", "คำตอบสั้นสำหรับประชาชน"],
        ],
      },
    ],
  },
  knowledge: {
    title: "องค์ความรู้",
    eyebrow: "Knowledge Archive",
    description: "เข้าสู่คลังปัญญาแห่งชาติ บทความ ฐานข้อมูล และองค์ความรู้สำหรับประชาชน",
    icon: "i-book",
    featured: ["เข้าสู่คลังองค์ความรู้", "/orst/knowledge"],
    groups: [
      {
        heading: "ค้นหาและฐานข้อมูล",
        links: [
          ["คลังองค์ความรู้", "/orst/knowledge", "ค้นจากทุกฐานข้อมูล"],
          ["บทความวิชาการ", "#", "บทความเผยแพร่และเอกสารอ้างอิง"],
          ["องค์ความรู้สำหรับประชาชน", "#", "เนื้อหาเข้าใจง่ายสำหรับทุกกลุ่ม"],
        ],
      },
      {
        heading: "หมวดความรู้",
        links: [
          ["ภาษาไทย", "#", "คำศัพท์ การใช้ภาษา และหลักเกณฑ์"],
          ["วิทยาศาสตร์", "#", "ศัพท์วิชาการและองค์ความรู้ร่วมสมัย"],
          ["ศิลปกรรม", "#", "ศิลปะ วัฒนธรรม และวรรณคดี"],
          ["สังคมศาสตร์", "#", "ชุมชน เศรษฐกิจ สังคม และนโยบาย"],
        ],
      },
    ],
  },
  publications: {
    title: "สื่อและสิ่งพิมพ์",
    eyebrow: "Publications & Media",
    description: "รวมหนังสือ วารสาร e-Book สื่อดิจิทัล และเอกสารเผยแพร่ของสำนักงาน",
    icon: "i-ebook",
    featured: ["ดูสื่อและสิ่งพิมพ์", "/orst/publications"],
    groups: [
      {
        heading: "สิ่งพิมพ์",
        links: [
          ["หนังสือและตำรา", "/orst/publications", "หนังสือวิชาการและเอกสารอ้างอิง"],
          ["วารสารราชบัณฑิตยสภา", "#", "วารสารและบทความเผยแพร่"],
          ["e-Book", "#", "อ่านออนไลน์หรือดาวน์โหลด"],
        ],
      },
      {
        heading: "สื่อดิจิทัล",
        links: [
          ["วิดีโอและสื่อมัลติมีเดีย", "#", "องค์ความรู้แบบรับชม"],
          ["Infographic", "#", "สรุปความรู้เข้าใจง่าย"],
          ["วิธีสั่งซื้อหนังสือ", "#", "ขั้นตอนและช่องทางชำระเงิน"],
        ],
      },
    ],
  },
  news: {
    title: "ข่าวสารและกิจกรรม",
    eyebrow: "News & Events",
    description: "ติดตามข่าวประชาสัมพันธ์ ประกาศ กิจกรรม และความเคลื่อนไหวล่าสุด",
    icon: "i-megaphone",
    featured: ["อ่านข่าวทั้งหมด", "/orst/news"],
    groups: [
      {
        heading: "ข่าวสาร",
        links: [
          ["ข่าวประชาสัมพันธ์", "/orst/news", "ข่าวสารทั่วไป"],
          ["ข่าวกิจกรรม", "#", "กิจกรรมและงานเผยแพร่"],
          ["บทบรรยายทางวิชาการ", "#", "สื่อความรู้จากกิจกรรม"],
        ],
      },
      {
        heading: "ประกาศ",
        links: [
          ["ประกาศจัดซื้อจัดจ้าง", "#", "ประกาศและเอกสารที่เกี่ยวข้อง"],
          ["ประกาศรับสมัครงาน", "#", "ข่าวสารงานบุคคล"],
          ["ข่าวสารทางราชการ", "#", "ประกาศเผยแพร่ทั่วไป"],
        ],
      },
    ],
  },
  services: {
    title: "บริการประชาชน",
    eyebrow: "Digital Services",
    description: "รวมบริการออนไลน์ แบบฟอร์ม การติดตามสถานะ และช่องทางติดต่อเจ้าหน้าที่",
    icon: "i-service",
    featured: ["เข้าสู่บริการประชาชน", "/orst/services"],
    groups: [
      {
        heading: "บริการออนไลน์",
        links: [
          ["สอบถามข้อมูลทางวิชาการ", "/orst/services", "ส่งคำถามและรับเลขติดตาม"],
          ["ขออนุญาตใช้เนื้อหา", "#", "ยื่นคำขอและแนบเอกสาร"],
          ["ร้องเรียน / เสนอแนะ", "#", "ส่งเรื่องและติดตามผล"],
        ],
      },
      {
        heading: "งานบริการ",
        links: [
          ["แบบฟอร์มออนไลน์", "#", "รวมแบบฟอร์มที่ใช้บ่อย"],
          ["คำถามที่พบบ่อย", "#", "คำตอบเกี่ยวกับบริการ"],
          ["คู่มือการใช้บริการ", "#", "ขั้นตอนและเอกสารประกอบ"],
        ],
      },
    ],
  },
  about: {
    title: "เกี่ยวกับเรา",
    eyebrow: "About ORST",
    description: "ข้อมูลสำนักงาน โครงสร้าง ผู้บริหาร ราชบัณฑิต ภาคีสมาชิก และข้อมูลหน่วยงาน",
    icon: "i-shield",
    featured: ["ข้อมูลสำนักงาน", "/orst/about"],
    groups: [
      {
        heading: "ข้อมูลสำนักงาน",
        links: [
          ["ประวัติความเป็นมา", "#", "ข้อมูลและพัฒนาการของสำนักงาน"],
          ["โครงสร้างองค์กร", "#", "หน่วยงานและภารกิจ"],
          ["ผู้บริหาร", "#", "คณะผู้บริหารปัจจุบัน"],
        ],
      },
      {
        heading: "ราชบัณฑิตและบุคลากร",
        links: [
          ["ราชบัณฑิตและภาคีสมาชิก", "#", "รายชื่อและผลงาน"],
          ["บุคลากร", "#", "ข้อมูลหน่วยงานและบุคลากร"],
          ["รายงานและแผนปฏิบัติราชการ", "#", "ข้อมูลความโปร่งใสและผลการดำเนินงาน"],
        ],
      },
    ],
  },
};

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

export default function Header({ active }: { active?: string }) {
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
            <button type="button"><Icon id="i-eye" /> สำหรับผู้พิการทางสายตา</button>
            <button type="button">ก-</button>
            <button type="button">ก</button>
            <button type="button">ก+</button>
            <button type="button">ความคมชัด</button>
          </div>
          <div className="topbar-group topbar-right">
            <a href="/orst/contact">ติดต่อเรา</a>
            <a href="#">สำหรับเจ้าหน้าที่</a>
            <span>ภาษา TH | EN</span>
            <a href="#">เข้าสู่ระบบ / สมัครสมาชิก</a>
          </div>
        </div>
      </div>

      <header className="site-header" id="site-header">
        <div className="container header-inner">
          <a className="brand brand-image" href="/orst" aria-label="สำนักงานราชบัณฑิตยสภา หน้าแรก">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/orst/images/logo.png"
              alt="สำนักงานราชบัณฑิตยสภา Office of the Royal Society"
              className="brand-logo"
            />
          </a>

          <nav className="main-nav" aria-label="เมนูหลัก">
            {navItems.map(([key, label, href]) => {
              const data = megaMenuData[key];
              const isActive = active === key;

              if (!data) {
                return (
                  <a key={key} className={isActive ? "active" : undefined} href={href}>
                    {label}
                  </a>
                );
              }

              return (
                <div className="nav-mega-item" key={key}>
                  <a
                    className={isActive ? "active" : undefined}
                    href={href}
                    data-mega={key}
                    aria-haspopup="true"
                  >
                    {label}
                    <span className="nav-caret" aria-hidden="true">
                      <svg viewBox="0 0 20 20">
                        <path d="M5.5 7.5 10 12l4.5-4.5"></path>
                      </svg>
                    </span>
                  </a>
                  <div className="mega-menu">
                    <div className="mega-inner" role="region" aria-label={`เมนูย่อย ${data.title}`}>
                      <div className="mega-feature">
                        <span className="mega-feature-icon">
                          <Icon id={data.icon} className="icon-lg" />
                        </span>
                        <span className="section-kicker">{data.eyebrow}</span>
                        <h3>{data.title}</h3>
                        <p>{data.description}</p>
                        <a href={data.featured[1]}>
                          {data.featured[0]} <span aria-hidden="true">→</span>
                        </a>
                      </div>
                      <div className="mega-groups">
                        {data.groups.map((group) => (
                          <div className="mega-group" key={group.heading}>
                            <h4>{group.heading}</h4>
                            {group.links.map(([text, url, desc]) => (
                              <a className="mega-link" href={url} key={text}>
                                <span>
                                  <strong>{text}</strong>
                                  <small>{desc || ""}</small>
                                </span>
                                <em aria-hidden="true">→</em>
                              </a>
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
            <button className="round-btn" type="button" aria-label="ค้นหา">
              <Icon id="i-search" /> <span>ค้นหา</span>
            </button>
            <a className="round-btn primary" href="/orst/services">บริการออนไลน์</a>
            <MobileMenuToggle />
          </div>
        </div>

        <nav id="mobile-menu" className="mobile-menu" aria-label="เมนูมือถือ">
          {navItems.map(([key, label, href]) => {
            const data = megaMenuData[key];
            const isActive = active === key;

            if (!data) {
              return (
                <a key={key} className={"mobile-link" + (isActive ? " active" : "")} href={href}>
                  {label}<span>›</span>
                </a>
              );
            }

            return (
              <details className="mobile-nav-group" key={key}>
                <summary className="mobile-accordion-btn">
                  <span>{label}</span><span aria-hidden="true">+</span>
                </summary>
                <div className="mobile-submenu">
                  <a href={data.featured[1]}><strong>{data.featured[0]}</strong></a>
                  {data.groups.map((group) => (
                    <div className="mobile-submenu-group" key={group.heading}>
                      <strong>{group.heading}</strong>
                      {group.links.map(([text, url]) => (
                        <a href={url} key={text}>{text}</a>
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
