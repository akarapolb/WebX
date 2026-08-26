import { Icon } from "./IconSprite";
import ThemeToggle from "./ThemeToggle";
import type { Tenant } from "@/lib/cms";

const NAV = [
  { label: "หน้าแรก", href: "/" },
  { label: "บริการ", href: "#services" },
  { label: "ข่าวสาร", href: "#news" },
  { label: "บริการออนไลน์", href: "/complaint.html" },
  { label: "เกี่ยวกับ สพร.", href: "/map.html" },
];

// Deliberately simplified from the original mega-menu dropdowns (see the
// Phase 4 plan) — same header bar, plain top-level links instead of the
// full flyout content, which isn't tenant/CMS-driven and isn't the thing
// this phase is proving.
export default function Header({ tenant, logoAlt }: { tenant: Tenant; logoAlt: string }) {
  const logo = tenant.brand?.logoUrl || "/assets/image/logo-dga.webp";
  return (
    <header className="site-header">
      <div className="bar">
        <a className="brand" href="/" aria-label={logoAlt}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src={logo} alt={logoAlt} width={150} height={46} />
        </a>
        <nav className="main-nav" aria-label="เมนูหลัก">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} aria-current={n.href === "/" ? "page" : undefined}>{n.label}</a>
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
