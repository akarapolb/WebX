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

export default function Footer({ tenant }: { tenant: Tenant | null }) {
  const columns = tenant?.footerColumns?.length ? tenant.footerColumns : FALLBACK_COLUMNS;
  const address = tenant?.contact?.address?.th;
  const phone = tenant?.contact?.phone;
  const email = tenant?.contact?.email;

  return (
    <footer className="footer orst-footer" id="footer">
      <div className="container">
        <div className="orst-footer-top">
          <div className="orst-footer-brand">
            <a className="orst-footer-logo-wrap" href="/orst" aria-label="สำนักงานราชบัณฑิตยสภา หน้าแรก">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/orst/images/logo.png"
                alt="สำนักงานราชบัณฑิตยสภา Office of the Royal Society"
                className="orst-footer-logo"
                loading="lazy"
              />
            </a>

            <p>
              แหล่งรวมองค์ความรู้ มาตรฐานภาษาไทย ศัพท์บัญญัติ สิ่งพิมพ์
              และบริการประชาชนของสำนักงานราชบัณฑิตยสภา
            </p>

            <div className="orst-footer-actions">
              <a className="orst-footer-primary" href="/orst/knowledge">
                เข้าคลังองค์ความรู้
              </a>
              <a className="orst-footer-secondary" href="/orst/services">
                บริการประชาชน
              </a>
            </div>
          </div>

          <div className="orst-footer-links">
            {columns.map((col, i) => (
              <div className="orst-footer-col" key={i}>
                <h3>{col.heading?.th}</h3>
                <ul>
                  {col.links.map((link, j) => (
                    <li key={j}>
                      <a href={link.url || "#"}>{link.label?.th}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="orst-footer-col orst-footer-contact">
              <h3>ติดต่อเรา</h3>
              {address ? (
                <p>{address}</p>
              ) : (
                <p>
                  สำนักงานราชบัณฑิตยสภา<br />
                  ศูนย์ราชการเฉลิมพระเกียรติฯ อาคารซี<br />
                  ถนนแจ้งวัฒนะ เขตหลักสี่ กรุงเทพมหานคร 10210
                </p>
              )}
              <p>
                โทรศัพท์: {phone || "0 2141 1728"}
                <br />
                อีเมล: {email || "saraban@orst.go.th"}
              </p>
            </div>
          </div>
        </div>

        <div className="orst-footer-bottom">
          <span>© 2026 สำนักงานราชบัณฑิตยสภา</span>

          <nav aria-label="ลิงก์นโยบายเว็บไซต์">
            <a href="#">นโยบายความเป็นส่วนตัว</a>
            <a href="#">เงื่อนไขการใช้งาน</a>
            <a href="#">แผนผังเว็บไซต์</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
