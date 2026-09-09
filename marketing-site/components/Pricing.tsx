import Icon from "./Icon";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { t, type Locale } from "@/lib/i18n";
import { SIGNUP_URL, CONTACT_URL } from "@/lib/config";

export default function Pricing({ locale }: { locale: Locale }) {
  const s = t(locale);
  return (
    <>
      <SiteHeader locale={locale} path="/pricing" />
      <main>
        <section className="ph">
          <div className="wrap">
            <div className="eyebrow">{s.pricingTeaser.eyebrow}</div>
            <h1>{s.pricing.h1}</h1>
            <p className="lead">{s.pricing.sub}</p>
          </div>
        </section>

        <section style={{ paddingBottom: 96 }}>
          <div className="wrap">
            <div className="plans">
              {(["free", "pro", "enterprise"] as const).map((k) => {
                const p = s.plans[k];
                return (
                  <div className={"plan" + (k === "pro" ? " hot" : "")} key={k}>
                    {k === "pro" && <span className="pop">{s.plans.popular}</span>}
                    <h3>{p.name}</h3>
                    <div className="price">{p.price}</div>
                    <div className="per">{p.per}</div>
                    <div className="lim"><span>{p.items}</span><span>{p.seats}</span></div>
                    <ul>{p.features.map((f) => <li key={f}><Icon name="tick" />{f}</li>)}</ul>
                    <a href={k === "enterprise" ? CONTACT_URL : SIGNUP_URL} className={"btn " + (k === "pro" ? "btn-p" : "btn-g")}>{p.cta}</a>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="sec sec--sunk">
          <div className="wrap">
            <div className="sec-h"><h2>{s.pricing.faqH2}</h2></div>
            <div className="faq">
              {s.pricing.faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="cta">
          <div className="wrap">
            <div><h2>{s.cta.h2}</h2><p>{s.cta.p}</p></div>
            <div className="cta-act">
              <a href={SIGNUP_URL} className="btn btn-w btn-lg">{s.cta.cta1} <Icon name="arrow" className="ic-arrow" /></a>
              <a href={CONTACT_URL} className="btn btn-gd btn-lg">{s.cta.cta2}</a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} path="/pricing" />
    </>
  );
}
