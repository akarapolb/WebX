import { Icon } from "./IconSprite";
import ThemeToggle from "./ThemeToggle";
import MobileNav from "./MobileNav";
import type { NavItem, Tenant } from "@/lib/cms";
import { homeHref, localizeHref, otherLocaleHref, t, type Locale } from "@/lib/i18n";

// A brand-new tenant with zero nav items configured yet — not a design to
// lean on, just a safety net against a genuinely blank header. Real tenants
// get a real starting set via strapi-cms's seedFlatNavItems, editable from
// there on through webx-studio's Nav Manager (see Branding.tsx's Navigation
// tab) — this is what closed the "hardcoded in source" gap that used to be
// here.
// `path` is this page's own URL, used for the language switch and aria-current;
// both default to the tenant's homepage. Thai stays the default locale.
export default function Header({ tenant, logoAlt, navItems, locale = "th", path }: { tenant: Tenant; logoAlt: string; navItems?: NavItem[]; locale?: Locale; path?: string }) {
  const logo = tenant.brand?.logoUrl || "/assets/image/logo-dga.webp";
  const home = homeHref(tenant.key, locale);
  const here = path || home;
  const nav = navItems && navItems.length ? navItems : [{ label: t("home", locale), url: homeHref(tenant.key, "th"), openNewTab: false, order: 1 }];
  const other = otherLocaleHref(here, locale);
  return (
    <header className="site-header">
      <div className="bar">
        <a className="brand" href={home} aria-label={logoAlt}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src={logo} alt={logoAlt} width={150} height={46} />
        </a>
        <nav className="main-nav" aria-label={t("mainMenu", locale)}>
          {nav.map((n, i) => {
            const href = localizeHref(n.url, locale);
            return (
            <a key={i} href={href} aria-current={href === here ? "page" : undefined}
              target={n.openNewTab ? "_blank" : undefined} rel={n.openNewTab ? "noopener noreferrer" : undefined}>{n.label}</a>
            );
          })}
        </nav>
        <div className="header-tools">
          <span className="lang-switch">
            {locale === "th"
              ? <><a href={here} aria-current="true" lang="th">TH</a><a href={other} lang="en" hrefLang="en" title={t("switchTo", "th")}>EN</a></>
              : <><a href={other} lang="th" hrefLang="th" title={t("switchTo", "en")}>TH</a><a href={here} aria-current="true" lang="en">EN</a></>}
          </span>
          <ThemeToggle />
          <MobileNav
            locale={locale} home={home} logo={logo} logoAlt={logoAlt}
            links={nav.map((n) => { const href = localizeHref(n.url, locale); return { label: n.label, href, current: href === here, newTab: n.openNewTab }; })}
            langLinks={[
              { label: "TH", lang: "th", href: locale === "th" ? here : other, current: locale === "th" },
              { label: "EN", lang: "en", href: locale === "en" ? here : other, current: locale === "en" },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
