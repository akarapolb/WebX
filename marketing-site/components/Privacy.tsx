import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { t, type Locale } from "@/lib/i18n";
import { CONTACT_URL, CONTACT_EMAIL } from "@/lib/config";

// A site whose hero promises "PDPA by default" had no privacy policy of its
// own — found in a 2026-09-12 review. Short and factual: what this site does
// (nothing — no cookies, no analytics), what Studio does with workspace and
// form data, PDPA rights, and a contact address. Same page chrome and type
// scale as Pricing so it reads as part of the site, not a legal appendix.
export default function Privacy({ locale }: { locale: Locale }) {
  const s = t(locale);
  return (
    <>
      <SiteHeader locale={locale} path="/privacy" />
      <main>
        <section className="ph">
          <div className="wrap">
            <h1>{s.privacy.h1}</h1>
            <p className="lead">{s.privacy.updated}</p>
          </div>
        </section>
        <section style={{ paddingBottom: 96 }}>
          <div className="wrap">
            <div className="faq">
              {s.privacy.sections.map((sec, i) => (
                <details key={sec.h} open>
                  <summary>{sec.h}</summary>
                  <p>
                    {sec.p}
                    {i === s.privacy.sections.length - 1 && <a href={CONTACT_URL}>{CONTACT_EMAIL}</a>}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} path="/privacy" />
    </>
  );
}
