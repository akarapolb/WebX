import Link from "next/link";
import Icon from "./Icon";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import { t, localePath, type Locale } from "@/lib/i18n";
import { SIGNUP_URL, CONTACT_URL } from "@/lib/config";

function Frame({ src, alt, url, dark }: { src: string; alt: string; url: string; dark?: boolean }) {
  return (
    <div className="frame">
      <div className="frame-bar"><i /><i /><i /><span>{url}</span></div>
      <img src={src} alt={alt} width={1440} height={900} loading={dark ? "eager" : "lazy"} />
    </div>
  );
}

export default function Home({ locale }: { locale: Locale }) {
  const s = t(locale);
  const pricing = localePath(locale, "/pricing");
  return (
    <>
      <SiteHeader locale={locale} path="/" />
      <main>
        <section className="hero">
          <div className="wrap">
            <div>
              <div className="eyebrow">{s.hero.eyebrow}</div>
              <h1>{s.hero.h1}</h1>
              <p className="lead">{s.hero.sub}</p>
              <div className="hero-cta">
                <a href={SIGNUP_URL} className="btn btn-w btn-lg">{s.hero.cta1} <Icon name="arrow" className="ic-arrow" /></a>
                <a href="#how" className="btn btn-gd btn-lg">{s.hero.cta2}</a>
              </div>
              <div className="hero-note">{s.hero.note}</div>
            </div>
            <div>
              <Frame src="/shots/dashboard.webp" alt={s.hero.shotAlt} url="studio.webx.io/dashboard" dark />
              <div className="frame-cap">{s.hero.shotCap}</div>
            </div>
          </div>
        </section>

        <section className="stats" aria-label="Key facts">
          <div className="wrap">
            {s.stats.map((x) => <div className="stat" key={x.l}><b>{x.n}</b><span>{x.l}</span></div>)}
          </div>
        </section>

        <section className="sec" id="features">
          <div className="wrap">
            <div className="sec-h">
              <div className="eyebrow">{s.features.eyebrow}</div>
              <h2>{s.features.h2}</h2>
              <p className="lead">{s.features.sub}</p>
            </div>
            <div className="feat">
              {s.features.items.map((f) => (
                <div key={f.t}>
                  <div className="ic"><Icon name={f.icon} /></div>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              ))}
            </div>
            <div className="tour" style={{ marginTop: 28 }}>
              <figure>
                <Frame src="/shots/builder.webp" alt={s.features.items[0].t} url="studio.webx.io/builder" />
                <figcaption><b>{s.features.items[0].t}</b>{s.features.items[0].d}</figcaption>
              </figure>
              <figure>
                <Frame src="/shots/analytics.webp" alt={s.features.items[7].t} url="studio.webx.io/analytics" />
                <figcaption><b>{s.features.items[7].t}</b>{s.features.items[7].d}</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="sec sec--sunk" id="gov">
          <div className="wrap gov">
            <div className="sec-h">
              <div className="eyebrow">{s.gov.eyebrow}</div>
              <h2>{s.gov.h2}</h2>
              <p className="lead">{s.gov.sub}</p>
              <a href={CONTACT_URL} className="btn btn-g">{s.gov.cta} <Icon name="arrow" className="ic-arrow" /></a>
            </div>
            <ul className="checks">
              {s.gov.items.map((x) => <li key={x}><Icon name="tick" /><span>{x}</span></li>)}
            </ul>
          </div>
        </section>

        <section className="sec" id="engines">
          <div className="wrap">
            <div className="sec-h">
              <div className="eyebrow">{s.engines.eyebrow}</div>
              <h2>{s.engines.h2}</h2>
            </div>
            <div className="engines">
              <div className="engine"><span className="tag">Strapi</span><h3>{s.engines.strapi.t}</h3><p>{s.engines.strapi.d}</p></div>
              <div className="engine"><span className="tag">WordPress</span><h3>{s.engines.wp.t}</h3><p>{s.engines.wp.d}</p></div>
            </div>
            <div className="engines-note"><Icon name="check" />{s.engines.note}</div>
          </div>
        </section>

        <section className="sec agents">
          <div className="wrap">
            <div>
              <div className="eyebrow">{s.agents.eyebrow}</div>
              <h2>{s.agents.h2}</h2>
              <p className="lead">{s.agents.p}</p>
            </div>
            <div className="term" aria-label={s.agents.toolsLabel}>
              <div className="term-h"><Icon name="terminal" />{s.agents.toolsLabel}</div>
              <ul>
                {s.agents.tools.map((x) => <li key={x}><Icon name="tick" />{x}</li>)}
              </ul>
              <div className="denied"><Icon name="x" />{s.agents.denied}</div>
            </div>
          </div>
        </section>

        <section className="sec" id="how">
          <div className="wrap">
            <div className="sec-h">
              <div className="eyebrow">{s.how.eyebrow}</div>
              <h2>{s.how.h2}</h2>
            </div>
            <div className="steps">
              {s.how.steps.map((st, i) => (
                <div className="step" key={st.t}>
                  <b className="n">0{i + 1}</b>
                  <h3>{st.t}</h3>
                  <p>{st.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec sec--sunk" id="pricing">
          <div className="wrap">
            <div className="sec-h">
              <div className="eyebrow">{s.pricingTeaser.eyebrow}</div>
              <h2>{s.pricingTeaser.h2}</h2>
            </div>
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
                    <a href={k === "enterprise" ? CONTACT_URL : SIGNUP_URL} className={"btn " + (k === "pro" ? "btn-p" : "btn-g")}>{p.cta}</a>
                  </div>
                );
              })}
            </div>
            <div className="plans-foot"><Link href={pricing}>{s.pricingTeaser.compare} <Icon name="arrow" /></Link></div>
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
      <SiteFooter locale={locale} path="/" />
    </>
  );
}
