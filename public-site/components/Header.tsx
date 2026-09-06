import { Icon } from "./IconSprite";
import ThemeToggle from "./ThemeToggle";
import type { NavItem, Tenant } from "@/lib/cms";

// A brand-new tenant with zero nav items configured yet — not a design to
// lean on, just a safety net against a genuinely blank header. Real tenants
// get a real starting set via strapi-cms's seedFlatNavItems, editable from
// there on through webx-studio's Nav Manager (see Branding.tsx's Navigation
// tab) — this is what closed the "hardcoded in source" gap that used to be
// here.
const FALLBACK_NAV: NavItem[] = [{ label: "หน้าแรก", url: "/", openNewTab: false, order: 1 }];

export default function Header({ tenant, logoAlt, navItems }: { tenant: Tenant; logoAlt: string; navItems?: NavItem[] }) {
  const logo = tenant.brand?.logoUrl || "/assets/image/logo-dga.webp";
  const nav = navItems && navItems.length ? navItems : FALLBACK_NAV;
  return (
    <header className="site-header">
      <div className="bar">
        <a className="brand" href="/" aria-label={logoAlt}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src={logo} alt={logoAlt} width={150} height={46} />
        </a>
        <nav className="main-nav" aria-label="เมนูหลัก">
          {nav.map((n, i) => (
            <a key={i} href={n.url} aria-current={n.url === "/" ? "page" : undefined}
              target={n.openNewTab ? "_blank" : undefined} rel={n.openNewTab ? "noopener noreferrer" : undefined}>{n.label}</a>
          ))}
        </nav>
        <div className="header-tools">
          <span className="lang-switch"><a href="/" aria-current="true" lang="th">TH</a></span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
