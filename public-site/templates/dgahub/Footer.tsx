// dgahub template footer — the first prototype's dark footer. Owner, address and
// phone come from the tenant record (brand.orgName, contact); the link columns
// are the tenant's footerColumns, so editors change them in WebX.
import type { Tenant, Locale } from "@/lib/cms";
import { localizeHref } from "@/lib/i18n";

export default function Footer({ tenant, locale, updated }: { tenant: Tenant; locale: Locale; updated?: string }) {
  const L = (v?: { th?: string; en?: string }) => (v ? v[locale] || v.th || "" : "");
  const owner = L(tenant.brand?.orgName) || tenant.name;
  const phone = tenant.contact?.phone;
  const email = tenant.contact?.email;
  const en = locale === "en";
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="grid g4">
          <div>
            <h2>{owner}</h2>
            {tenant.contact?.address && <p className="small">{L(tenant.contact.address)}</p>}
            <p className="small">
              {phone && <>{en ? "Tel." : "โทร"} <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a><br /></>}
              {email && <a href={`mailto:${email}`}>{email}</a>}
            </p>
          </div>
          {(tenant.footerColumns || []).map((col, i) => (
            <nav key={i} aria-labelledby={`f-col-${i}`}>
              <h2 id={`f-col-${i}`}>{L(col.heading)}</h2>
              <ul>
                {col.links.map((l, j) => {
                  const href = localizeHref(l.url || "#", locale);
                  const ext = /^https?:/.test(href);
                  return <li key={j}><a href={href} rel={ext ? "noopener" : undefined}>{L(l.label)}</a></li>;
                })}
              </ul>
            </nav>
          ))}
        </div>
        <div className="base small">
          <span>© {new Date().getFullYear()} {owner}</span>
          <span>
            <a href="/privacy">{en ? "Privacy" : "ความเป็นส่วนตัว"}</a>
            {updated && <> · {en ? "Updated" : "ปรับปรุงล่าสุด"}: {updated}</>}
          </span>
        </div>
      </div>
    </footer>
  );
}
