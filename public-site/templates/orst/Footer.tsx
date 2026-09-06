// Ported from ORST Website/assets/js/components.js — the current
// renderFooter() (the "Modern ORST Footer" one using the orst-footer* classes
// in components.css; the older footer-grid version above it in the source is
// commented out there and not used). Content is copied verbatim, including
// the "© 2026" copyright line as literally written in the source (not
// converted to a Buddhist-era year).
//
// Intentionally NOT ported here (not footer columns/links/copyright content,
// and each needs client JS state that doesn't exist in this repo yet):
//   - The floating "ช่วยการเข้าถึง" (access-float) button and the
//     #search-modal / #access-modal dialogs. In components.js these are
//     emitted by renderFooter() only because that's where the shared,
//     page-global modal markup happened to be injected — they're really
//     cross-page utility UI (search, accessibility toolbar), not footer
//     content, and belong in their own component if/when that
//     functionality gets built.
// Route paths follow the same /orst/... convention as Header.tsx (see its
// file-level comment) instead of components.js's `${basePath}xxx.html`.
//
// `tenant` (from lib/cms.ts's getTenant("orst")) supplies the contact info
// and the 3 nav-link columns when present; each falls back to the exact
// original hardcoded copy below when the tenant record or that particular
// field isn't populated, so a missing/partial tenant record never breaks
// the footer.

import type { Tenant } from "@/lib/cms";
import ShareButtons from "@/components/ShareButtons";
import Picture from "@/components/Picture";

// Bilingual EN (TOR gap) — same known-bilingual-slugs + href-localizing
// helper as Header.tsx (duplicated rather than shared, matching this file's
// own established per-tenant-duplication convention). Footer's own quick
// links only ever point at "/orst/knowledge" (not bilingual) and
// "/orst/services" (is), so only the latter needs rewriting.
function localizeHref(url: string, locale: "th" | "en"): string {
  if (locale !== "en" || !url.startsWith("/orst")) return url;
  const slug = url === "/orst" ? "home" : url.replace(/^\/orst\//, "");
  if (!new Set(["home", "about", "contact", "services"]).has(slug)) return url;
  return url === "/orst" ? "/en/orst" : "/en" + url;
}

const STR = {
  th: {
    tagline: "แหล่งรวมองค์ความรู้ มาตรฐานภาษาไทย ศัพท์บัญญัติ สิ่งพิมพ์ และบริการประชาชนของสำนักงานราชบัณฑิตยสภา",
    knowledge: "เข้าคลังองค์ความรู้", services: "บริการประชาชน", contact: "ติดต่อเรา",
    phone: "โทรศัพท์", email: "อีเมล", copyright: "© 2026 สำนักงานราชบัณฑิตยสภา",
    privacy: "นโยบายความเป็นส่วนตัว", terms: "เงื่อนไขการใช้งาน", sitemap: "แผนผังเว็บไซต์",
    policyNav: "ลิงก์นโยบายเว็บไซต์", homeAria: "สำนักงานราชบัณฑิตยสภา หน้าแรก",
    address: <>สำนักงานราชบัณฑิตยสภา<br />ศูนย์ราชการเฉลิมพระเกียรติฯ อาคารซี<br />ถนนแจ้งวัฒนะ เขตหลักสี่ กรุงเทพมหานคร 10210</>,
  },
  en: {
    tagline: "The national knowledge institute — Thai language standards, terminology, publications, and public services from the Office of the Royal Society.",
    knowledge: "Knowledge hub", services: "Public services", contact: "Contact us",
    phone: "Phone", email: "Email", copyright: "© 2026 Office of the Royal Society",
    privacy: "Privacy policy", terms: "Terms of use", sitemap: "Sitemap",
    policyNav: "Site policy links", homeAria: "Office of the Royal Society home",
    address: <>Office of the Royal Society<br />Government Complex, Building C<br />Chaeng Watthana Rd., Lak Si, Bangkok 10210</>,
  },
} as const;

const FALLBACK_COLUMNS: { heading: { th?: string }; links: { label: { th?: string }; url?: string }[] }[] = [
  {
    heading: { th: "บริการหลัก" },
    links: [
      { label: { th: "พจนานุกรม" }, url: "/orst/dictionary" },
      { label: { th: "ศัพท์บัญญัติ" }, url: "#" },
      { label: { th: "คำทับศัพท์" }, url: "#" },
      { label: { th: "ราชาศัพท์" }, url: "#" },
    ],
  },
  {
    heading: { th: "องค์ความรู้" },
    links: [
      { label: { th: "คลังองค์ความรู้" }, url: "/orst/knowledge" },
      { label: { th: "E-Book และสิ่งพิมพ์" }, url: "/orst/publications" },
      { label: { th: "วารสาร" }, url: "#" },
      { label: { th: "สื่อมัลติมีเดีย" }, url: "#" },
    ],
  },
  {
    heading: { th: "ข่าวและบริการ" },
    links: [
      { label: { th: "ข่าวและประกาศ" }, url: "/orst/news" },
      { label: { th: "บริการออนไลน์" }, url: "/orst/services" },
      { label: { th: "แบบฟอร์มออนไลน์" }, url: "#" },
      { label: { th: "คำถามที่พบบ่อย" }, url: "#" },
    ],
  },
];

export default function Footer({ tenant, locale = "th" }: { tenant: Tenant | null; locale?: "th" | "en" }) {
  const s = STR[locale];
  const columns = tenant?.footerColumns?.length ? tenant.footerColumns : FALLBACK_COLUMNS;
  const address = tenant?.contact?.address?.[locale] || tenant?.contact?.address?.th;
  const phone = tenant?.contact?.phone;
  const email = tenant?.contact?.email;

  return (
    <footer className="footer orst-footer" id="footer">
      <div className="container">
        <div className="orst-footer-top">
          <div className="orst-footer-brand">
            <a className="orst-footer-logo-wrap" href={locale === "en" ? "/en/orst" : "/orst"} aria-label={s.homeAria}>
              <Picture
                src="/assets/orst/images/logo.png"
                alt="สำนักงานราชบัณฑิตยสภา Office of the Royal Society"
                className="orst-footer-logo"
                loading="lazy"
              />
            </a>

            <p>{s.tagline}</p>

            <div className="orst-footer-actions">
              <a className="orst-footer-primary" href="/orst/knowledge">
                {s.knowledge}
              </a>
              <a className="orst-footer-secondary" href={localizeHref("/orst/services", locale)}>
                {s.services}
              </a>
            </div>
          </div>

          <div className="orst-footer-links">
            {columns.map((col, i) => (
              <div className="orst-footer-col" key={i}>
                <h3>{(col.heading as any)?.[locale] || col.heading?.th}</h3>
                <ul>
                  {col.links.map((link, j) => (
                    <li key={j}>
                      <a href={link.url || "#"}>{(link.label as any)?.[locale] || link.label?.th}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="orst-footer-col orst-footer-contact">
              <h3>{s.contact}</h3>
              {address ? <p>{address}</p> : <p>{s.address}</p>}
              <p>
                {s.phone}: {phone || "0 2141 1728"}
                <br />
                {s.email}: {email || "saraban@orst.go.th"}
              </p>
            </div>
          </div>
        </div>

        <div className="orst-footer-bottom">
          <span>{s.copyright}</span>

          <ShareButtons />

          <nav aria-label={s.policyNav}>
            <a href="#">{s.privacy}</a>
            <a href="#">{s.terms}</a>
            <a href="#">{s.sitemap}</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
