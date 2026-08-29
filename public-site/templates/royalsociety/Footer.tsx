// Ported from RoyalSociety source's assets/js/01-config.js
// (window.RS_CONFIG.site / .contact / .footer) + assets/js/02-components.js's
// renderFooter(). Thai copy, newsletter copy, legal links and the copyright
// line are copied verbatim from 01-config.js and stay hardcoded (out of
// scope). The map embed URL/link are rebuilt with the same
// encodeURIComponent(contact.mapQuery) logic renderFooter() used, from the
// same mapQuery value ("ราชบัณฑิตยสภา") — mapQuery has no equivalent field
// on the tenant record, so it also stays hardcoded.
//
// `contact.phone`/`contact.email`, `footerColumns`, and `social` ARE
// tenant-driven (Phase 9): the `tenant` prop (getTenant("royalsociety"))
// supplies real Strapi-seeded values, falling back to the exact hardcoded
// CONTACT/FOOTER_COLUMNS/SOCIALS constants below field-by-field when
// `tenant` is null or a given field is missing. Two shape adaptations are
// needed since the tenant schema differs from this template's original
// static shape:
//   - tenant.footerColumns' heading/link-label are bilingual objects
//     ({th,en}) rather than plain strings — normalized to Thai strings here
//     (this template is Thai-only, matching cms.ts's "Thai locale only"
//     scope note).
//   - tenant.social items are {label,url}, with no equivalent of SOCIALS'
//     `symbol` (single-char icon glyph). A small SOCIAL_SYMBOLS lookup maps
//     known labels (Facebook/YouTube/Instagram/X) to their existing symbol
//     characters so icons don't disappear; an unrecognized label falls back
//     to its own first character.
//
// Route paths use `/royalsociety/...` instead of the source's relative
// `${base}pages/xxx.html`, matching Header.tsx's convention (see its
// file-level comment) and app/royalsociety/[page]/page.tsx's PAGES list.
//
// Intentionally rendered inert / not wired up (static markup only, no
// onSubmit — this file stays a Server Component, and no newsletter API
// exists in this port yet):
//   - The newsletter `<form>` (email input + submit button).
//
// This is a plain, static Server Component — the one bit of interactivity
// (the newsletter form's real submit handling) is isolated in its own small
// Client Component, same reasoning as Header.tsx's mobile-drawer toggle.
import type { Tenant } from "@/lib/cms";
import NewsletterForm from "./NewsletterForm";

const SITE = {
  name: "ราชบัณฑิตยสภา",
  tagline: "สถาบันหลักของชาติด้านภาษาและวัฒนธรรม องค์ความรู้เพื่อสังคมไทย",
  logo: "/assets/royalsociety/images/logo-image.png",
  logoAlt: "ตราราชบัณฑิตยสภา",
  copyright: "© 2026 ราชบัณฑิตยสภา สงวนลิขสิทธิ์",
};

const CONTACT = {
  phone: "0 2481 0347",
  email: "saraban@royalsociety.go.th",
  officeHours: "จันทร์ - ศุกร์ 08:30 - 16:30 น.",
  mapQuery: "ราชบัณฑิตยสภา",
};

const FOOTER_COLUMNS: readonly { heading: string; links: readonly { label: string; href: string }[] }[] = [
  {
    heading: "ลิงก์ด่วน",
    links: [
      { label: "เกี่ยวกับราชบัณฑิตยสภา", href: "/royalsociety/about" },
      { label: "คลังองค์ความรู้", href: "/royalsociety/knowledge" },
      { label: "สิ่งพิมพ์", href: "/royalsociety/publications" },
      { label: "แผนผังเว็บไซต์", href: "#" },
    ],
  },
  {
    heading: "บริการยอดนิยม",
    links: [
      { label: "สืบค้นพจนานุกรม", href: "#" },
      { label: "ดาวน์โหลดแบบฟอร์ม", href: "#" },
      { label: "ส่งคำถาม / ข้อเสนอแนะ", href: "#" },
      { label: "บริการออนไลน์", href: "/royalsociety/services" },
    ],
  },
];

const SOCIALS: readonly { label: string; symbol: string; href: string }[] = [
  { label: "Facebook", symbol: "f", href: "#" },
  { label: "YouTube", symbol: "▶", href: "#" },
  { label: "Instagram", symbol: "◎", href: "#" },
  { label: "X", symbol: "x", href: "#" },
];

// icon glyphs for tenant.social entries — see the SOCIALS shape-adaptation
// note above.
const SOCIAL_SYMBOLS: Record<string, string> = {
  Facebook: "f",
  YouTube: "▶",
  Instagram: "◎",
  X: "x",
};

const NEWSLETTER = {
  heading: "ติดตามข่าวสาร",
  desc: "รับข่าวสารและกิจกรรมล่าสุดจากราชบัณฑิตยสภา",
  placeholder: "อีเมลของคุณ",
};

const LEGAL_LINKS: readonly { label: string; href: string }[] = [
  { label: "นโยบายความเป็นส่วนตัว", href: "#" },
  { label: "เงื่อนไขการให้บริการ", href: "#" },
  { label: "แผนผังเว็บไซต์", href: "#" },
];

export default function Footer({ tenant }: { tenant: Tenant | null }) {
  const mapQuery = encodeURIComponent(CONTACT.mapQuery);
  const mapSrc = `https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

  const phone = tenant?.contact?.phone || CONTACT.phone;
  const email = tenant?.contact?.email || CONTACT.email;

  const columns = tenant?.footerColumns?.length
    ? tenant.footerColumns.map((c) => ({
        heading: c.heading?.th || "",
        links: (c.links || []).map((l) => ({ label: l.label?.th || "", href: l.url || "#" })),
      }))
    : FOOTER_COLUMNS.map((c) => ({
        heading: c.heading,
        links: c.links.map((l) => ({ label: l.label, href: l.href })),
      }));

  const socials = tenant?.social?.length
    ? tenant.social.map((s) => ({
        label: s.label || "",
        href: s.url || "#",
        symbol: SOCIAL_SYMBOLS[s.label || ""] || (s.label || "?").charAt(0),
      }))
    : SOCIALS.map((s) => ({ label: s.label, href: s.href, symbol: s.symbol }));

  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div>
          <div className="footer-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-mark" src={SITE.logo} alt={SITE.logoAlt} loading="eager" />
            <div>
              <h3>{SITE.name}</h3>
              <p>{SITE.tagline}</p>
              <div className="socials">
                {socials.map((item, i) => (
                  <a href={item.href} aria-label={item.label} key={item.label || i}>{item.symbol}</a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {columns.map((column, i) => (
          <div key={column.heading || i}>
            <h4>{column.heading}</h4>
            <ul>
              {column.links.map((link, j) => (
                <li key={link.label || j}><a href={link.href}>{link.label}</a></li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h4>ติดต่อเรา</h4>
          <ul>
            <li>{phone}</li>
            <li>{email}</li>
            <li>{CONTACT.officeHours}</li>
          </ul>
        </div>

        <div>
          <h4>{NEWSLETTER.heading}</h4>
          <p>{NEWSLETTER.desc}</p>
          <NewsletterForm placeholder={NEWSLETTER.placeholder} />
        </div>
      </div>

      <div className="container footer-map-row">
        <div className="footer-map-info">
          <h4>แผนที่ตั้งสำนักงาน</h4>
          <p>ดูเส้นทางและตำแหน่งที่ตั้งของ{SITE.name}บน Google Maps</p>
          <a href={mapLink} target="_blank" rel="noopener">เปิดใน Google Maps<span>→</span></a>
        </div>
        <div className="footer-map-box">
          <iframe
            src={mapSrc}
            title={`แผนที่${SITE.name}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>

      <div className="container footer-bottom">
        <span>{SITE.copyright}</span>
        <div>
          {LEGAL_LINKS.map((link) => (
            <a href={link.href} key={link.label}>{link.label}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}
