import Link from "next/link";
import { t, localePath, otherLocale, type Locale } from "@/lib/i18n";
import { LOGIN_URL, CONTACT_URL, CONTACT_EMAIL } from "@/lib/config";

export default function SiteFooter({ locale, path }: { locale: Locale; path: "/" | "/pricing" }) {
  const s = t(locale);
  const home = localePath(locale, "/");
  const hash = (h: string) => (home === "/" ? "/" : home + "/") + "#" + h;
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="cols">
          <div>
            <div className="logo"><span className="logo-mark">W</span><span>WebX</span></div>
            <p className="tag">{s.footer.tagline}</p>
          </div>
          <div>
            <h4>{s.footer.product}</h4>
            <ul>
              <li><Link href={hash("features")}>{s.nav.features}</Link></li>
              <li><Link href={hash("engines")}>{s.nav.engines}</Link></li>
              <li><Link href={localePath(locale, "/pricing")}>{s.nav.pricing}</Link></li>
            </ul>
          </div>
          <div>
            <h4>{s.footer.company}</h4>
            <ul>
              <li><Link href={hash("gov")}>{s.nav.gov}</Link></li>
              <li><a href={LOGIN_URL}>{s.footer.signin}</a></li>
            </ul>
          </div>
          <div>
            <h4>{s.footer.contact}</h4>
            <ul>
              <li><a href={CONTACT_URL}>{CONTACT_EMAIL}</a></li>
            </ul>
          </div>
        </div>
        <div className="bot">
          <span>© {new Date().getFullYear()} {s.footer.rights}</span>
          <Link href={localePath(otherLocale(locale), path)} hrefLang={otherLocale(locale)}>{s.nav.lang}</Link>
        </div>
      </div>
    </footer>
  );
}
