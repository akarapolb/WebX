import type { Tenant } from "@/lib/cms";

// Same fields tenant.js patches into the DOM client-side after load (brand,
// contact, footerColumns) — rendered directly into the static HTML here
// instead, per tenant, at build time. This is the concrete thing replacing
// the old client-side re-brand-after-load / cms-cloak flash-prevention hack.
export default function Footer({ tenant }: { tenant: Tenant }) {
  const orgName = tenant.brand?.orgName?.th || tenant.name;
  const logo = tenant.brand?.logoUrl || "/assets/image/logo-dga.webp";
  const address = tenant.contact?.address?.th;
  const phone = tenant.contact?.phone;
  const columns = tenant.footerColumns || [];

  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-brand">
          <a className="brand" href="/" aria-label={orgName + " — หน้าแรก"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src={logo} alt={orgName} width={150} height={46} />
          </a>
          <p className="footer-org">{orgName}</p>
          <address className="footer-addr">
            {address && (
              <span className="footer-addr__line">
                <svg className="footer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path d="M12 21s-7-6.6-7-11a7 7 0 1 1 14 0c0 4.4-7 11-7 11z" /><circle cx={12} cy={10} r={2.5} />
                </svg>
                {address}
              </span>
            )}
            {phone && (
              <a className="footer-addr__line" href={"tel:" + phone.replace(/[^0-9+]/g, "")}>
                <svg className="footer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 5c0 9 7 16 16 16l3-3-4-3-2 2c-3-1-6-4-7-7l2-2-3-4z" />
                </svg>
                โทร {phone}
              </a>
            )}
          </address>
        </div>
        {columns.map((col, i) => (
          <div key={i}>
            <h3>{col.heading?.th}</h3>
            <ul>
              {(col.links || []).map((l, j) => (
                <li key={j}><a href={l.url || "#"}>{l.label?.th}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="footer-bottom">
        <div className="wrap">
          <span>© 2569 {orgName}</span>
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <a href="/console.html" style={{ color: "inherit" }}>เข้าระบบผู้ดูแล</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
