// dgahub template — renders a WebX page's blocks in the first prototype's
// design (web/ in DGA-WebPublic). Content and order come from the CMS page,
// so editors keep full control; only the look is template-specific.
//
// Layout rules carried over from the prototype:
//  - home: the hero is dark, and a stat-row right after it becomes the hero's
//    KPI cards; inner pages: the hero becomes the dark page header with a
//    breadcrumb.
//  - a chart next to an assistant share one two-column section.
//  - sections alternate white / light grey.
// The data blocks (chart, dataset download, assistant, form) reuse WebX's own
// components and are restyled by /assets/dgahub/site.css.
import ChartBlock from "@/components/blocks/ChartBlock";
import DatasetDownloadBlock from "@/components/blocks/DatasetDownloadBlock";
import AssistantBlock from "@/components/blocks/AssistantBlock";
import FormBlock from "@/components/blocks/FormBlock";
import EmbedBlock from "@/components/blocks/EmbedBlock";
import { sanitizeCmsHtml, jsonForScript } from "@/lib/sanitize";
import { fmtDate, localizeHref, type Locale } from "@/lib/i18n";
import { mediaUrl, type Dataset } from "@/lib/cms";
import { Icon } from "./Icon";

type Ctx = { locale: Locale; tenant: string; home: string; datasets: Dataset[]; articles: any[]; faqs: any[] };

const kind = (b: any) => String(b?.__component || "");

// The AI assistant and the feedback form call the CMS from the visitor's
// browser. A public copy of the site built against a CMS on this machine
// (localhost) can't reach it, so those blocks show a short note instead.
const isLocal = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u);
const CMS_REACHABLE = !(isLocal(process.env.STRAPI_URL || "http://localhost:1337") && !isLocal(process.env.PUBLIC_SITE_URL || "http://localhost:3100"));

function Offline({ locale, what }: { locale: Locale; what: "assistant" | "form" }) {
  const en = locale === "en";
  const name = what === "assistant" ? (en ? "The AI assistant" : "ผู้ช่วย AI") : (en ? "The feedback form" : "แบบฟอร์มความคิดเห็น");
  return (
    <div className="card dh-offline" role="note">
      <h3>{name}</h3>
      <p className="muted" style={{ margin: 0 }}>{en
        ? "This public preview runs without the CMS, so this feature is switched off. It works on the full WebX installation."
        : "ตัวอย่างสาธารณะนี้ไม่ได้เชื่อมต่อระบบ CMS จึงปิดฟังก์ชันนี้ไว้ ใช้งานได้บนระบบ WebX เต็มรูปแบบ"}</p>
    </div>
  );
}

export default function Blocks({ blocks, isHome, ...ctx }: { blocks: any[]; isHome: boolean } & Ctx) {
  const out: React.ReactNode[] = [];
  let alt = false;
  const section = (key: string, body: React.ReactNode, label?: string) => {
    out.push(
      <section key={key} className={"section" + (alt ? " alt" : "")} aria-labelledby={label}>
        <div className="wrap">{body}</div>
      </section>,
    );
    alt = !alt;
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const next = blocks[i + 1];
    const key = `${kind(b)}-${i}`;
    switch (kind(b)) {
      case "block.hero": {
        if (isHome) {
          const stats = kind(next) === "block.stat-row" ? next : null;
          if (stats) i++;
          out.push(<HomeHero key={key} b={b} stats={stats} ctx={ctx} />);
        } else {
          out.push(<PageHead key={key} b={b} ctx={ctx} />);
        }
        break;
      }
      case "block.stat-row":
        section(key, <div className="kpis">{(b.items || []).map((s: any, j: number) => <Kpi key={j} s={s} light />)}</div>);
        break;
      case "block.chart":
      case "block.assistant": {
        const pair = (kind(b) === "block.chart" && kind(next) === "block.assistant") || (kind(b) === "block.assistant" && kind(next) === "block.chart");
        // Two or more charts in a row form one dashboard-style grid section.
        let run = 0;
        while (kind(blocks[i + run]) === "block.chart") run++;
        if (run >= 2) {
          const charts = blocks.slice(i, i + run);
          i += run - 1;
          section(key, <div className="grid g2 dh-dash">{charts.map((c, j) => <div key={j}>{dataBlock(c, ctx)}</div>)}</div>);
        } else if (pair) {
          i++;
          section(key, <div className="grid g2" style={{ alignItems: "start" }}>{dataBlock(b, ctx)}{dataBlock(next, ctx)}</div>);
        } else {
          section(key, dataBlock(b, ctx));
        }
        break;
      }
      case "block.feature-grid": {
        const hid = `fg-${i}`;
        section(key, <>
          {b.heading && <h2 id={hid}>{b.heading}</h2>}
          <div className={"grid g" + (b.columns === "2" ? "2" : b.columns === "4" ? "4" : "3")}>
            {(b.items || []).map((it: any, j: number) => <FeatureCard key={j} it={it} locale={ctx.locale} />)}
          </div>
        </>, b.heading ? hid : undefined);
        break;
      }
      case "block.news-panel": {
        const hid = `news-${i}`;
        const items = ctx.articles.slice(0, 6);
        section(key, <>
          <h2 id={hid}>{b.newsTabLabel || (ctx.locale === "en" ? "News" : "ข่าว")}</h2>
          {items.length ? (
            <ul className="news">
              {items.map((a: any) => (
                <li key={a.documentId || a.id}>
                  <time dateTime={a.publishDate}>{fmtDate(a.publishDate, ctx.locale)}</time>
                  <span>{a.slug ? <a href={`${ctx.home}/news/${a.slug}`}>{a.title}</a> : a.title}{a.excerpt && !String(a.excerpt).startsWith(String(a.title)) ? <span className="muted small"><br />{a.excerpt}</span> : null}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">{ctx.locale === "en" ? "No news yet." : "ยังไม่มีข่าว"}</p>}
          {items.length > 0 && <p style={{ marginTop: 20 }}><a className="dh-more" href={`${ctx.home}/news`}>{ctx.locale === "en" ? "All news" : "ข่าวทั้งหมด"} →</a></p>}
        </>, hid);
        break;
      }
      case "block.cta-banner":
        out.push(
          <section key={key} className="band" aria-label={b.heading || undefined}>
            <div className="wrap">
              <p><strong>{b.heading}</strong>{b.text ? <><br /><span style={{ fontWeight: 400 }}>{b.text}</span></> : null}</p>
              {b.buttonLabel && <a className="btn" href={localizeHref(b.buttonUrl || "#", ctx.locale)}>{b.buttonLabel} →</a>}
            </div>
          </section>,
        );
        break;
      case "block.tabs": {
        const hid = `tabs-${i}`;
        section(key, <>
          {b.heading && <h2 id={hid}>{b.heading}</h2>}
          <div style={{ marginTop: 16 }}>
            {(b.items || []).map((it: any, j: number) => (
              <details className="acc" key={j}>
                <summary>{it.title}</summary>
                <div dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(it.body || "") }} />
              </details>
            ))}
          </div>
        </>, b.heading ? hid : undefined);
        break;
      }
      case "block.faq": {
        const hid = `faq-${i}`;
        const faqs = ctx.faqs;
        const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f: any) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer || "" } })) };
        section(key, <>
          <h2 id={hid}>{b.heading || (ctx.locale === "en" ? "Frequently asked questions" : "คำถามที่พบบ่อย")}</h2>
          <div style={{ marginTop: 16 }}>
            {faqs.map((f: any, j: number) => (
              <details className="acc" key={j}><summary>{f.question}</summary><div><p>{f.answer || ""}</p></div></details>
            ))}
          </div>
          {faqs.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />}
        </>, hid);
        break;
      }
      case "block.richtext":
        section(key, <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(b.body || "") }} />);
        break;
      case "block.dataset-download":
        section(key, <DatasetDownloadBlock b={b} datasets={ctx.datasets} tenant={ctx.tenant} locale={ctx.locale}
          links={{ csv: (d) => `${ctx.home}/data/${d.key}.csv`, json: (d) => `${ctx.home}/data/${d.key}.json` }} />);
        break;
      case "block.form":
        section(key, CMS_REACHABLE ? <div className="card" style={{ maxWidth: 760 }}><FormBlock b={b} tenant={ctx.tenant} locale={ctx.locale} /></div> : <div style={{ maxWidth: 760 }}><Offline locale={ctx.locale} what="form" /></div>);
        break;
      case "block.image": {
        const url = mediaUrl(b.image);
        if (!url) break;
        section(key, (
          <figure style={{ margin: 0, maxWidth: b.full ? "none" : 900 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={b.caption || ""} style={{ width: "100%", height: "auto", borderRadius: "var(--radius)", display: "block" }} />
            {b.caption && <figcaption className="cite">{b.caption}</figcaption>}
          </figure>
        ));
        break;
      }
      case "block.blockquote":
        section(key, (
          <figure className="dh-quote">
            <blockquote><p>{b.quote}</p></blockquote>
            {b.attribution && <figcaption>— {b.attribution}</figcaption>}
          </figure>
        ));
        break;
      case "block.spacer":
        // Spacing between sections, not a section of its own (no alternating background).
        out.push(b.style === "line"
          ? <div key={key} className="wrap"><hr className="dh-rule" /></div>
          : <div key={key} aria-hidden="true" style={{ height: b.size === "sm" ? 16 : b.size === "lg" ? 64 : 32 }} />);
        break;
      case "block.embed":
        section(key, <EmbedBlock b={b} />);
        break;
      default:
        // Blocks this template has no design for yet are skipped rather than
        // rendered with another template's unstyled markup.
        break;
    }
  }
  return <>{out}</>;
}

function dataBlock(b: any, ctx: Ctx) {
  if (kind(b) === "block.assistant") return CMS_REACHABLE ? <AssistantBlock key="a" b={b} tenant={ctx.tenant} locale={ctx.locale} /> : <Offline key="a" locale={ctx.locale} what="assistant" />;
  return (
    <div className="card" key="c">
      <ChartBlock b={b} dataset={ctx.datasets.find((d) => d.key === b.datasetKey)} locale={ctx.locale} />
    </div>
  );
}

function Kpi({ s, light }: { s: any; light?: boolean }) {
  return (
    <div className={"kpi" + (light ? " kpi-light" : "")}>
      <div className="k">{s.label}</div>
      <div className="v">{s.value}</div>
    </div>
  );
}

function HomeHero({ b, stats, ctx }: { b: any; stats: any; ctx: Omit<Ctx, never> }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div>
          {b.kicker && <p className="eyebrow">{b.kicker}</p>}
          <h1 id="hero-title">{b.headingAccent ? <>{b.heading}<em>{b.headingAccent}</em></> : <HeroHeading text={b.heading} />}</h1>
          {b.subheading && <p className="lead">{b.subheading}</p>}
          {b.ctaLabel && (
            <div className="hero-actions">
              <a className="btn" href={localizeHref(b.ctaUrl || "#", ctx.locale)}>{b.ctaLabel} →</a>
            </div>
          )}
        </div>
        {stats?.items?.length ? (
          <div className={"kpis" + (stats.items.length % 2 === 0 ? " kpis-2" : "")}>{stats.items.map((s: any, j: number) => <Kpi key={j} s={s} />)}</div>
        ) : null}
      </div>
    </section>
  );
}

/** The second half of the title shows in the accent colour on its own line. It
 *  comes from the hero's headingAccent field; older content marked it with a "|"
 *  in the heading ("รัฐบาลดิจิทัล|ของประเทศไทย"), which still works. */
function HeroHeading({ text }: { text?: string }) {
  const [a, ...rest] = String(text || "").split("|");
  return rest.length ? <>{a}<em>{rest.join("")}</em></> : <>{a}</>;
}

function PageHead({ b, ctx }: { b: any; ctx: Ctx }) {
  const title = (String(b.heading || "").replace(/\|/g, "") + (b.headingAccent ? " " + b.headingAccent : "")).trim();
  const crumbHome = ctx.locale === "en" ? "Home" : "หน้าแรก";
  return (
    <div className="page-head">
      <div className="wrap">
        <nav className="crumbs" aria-label={ctx.locale === "en" ? "Breadcrumb" : "เส้นทางนำทาง"}>
          <ol>
            <li><a href={ctx.home}>{crumbHome}</a></li>
            <li aria-current="page">{b.kicker || title}</li>
          </ol>
        </nav>
        <h1>{title}</h1>
        {b.subheading && <p>{b.subheading}</p>}
        {b.ctaLabel && <p style={{ marginTop: 16 }}><a className="btn" href={localizeHref(b.ctaUrl || "#", ctx.locale)}>{b.ctaLabel}</a></p>}
      </div>
    </div>
  );
}

function FeatureCard({ it, locale }: { it: any; locale: Locale }) {
  const href = it.url ? localizeHref(it.url, locale) : "";
  const ext = /^https?:/.test(href);
  return (
    <div className="card">
      <div className="icon"><Icon name={it.icon} /></div>
      <h3>{href ? <a href={href} rel={ext ? "noopener" : undefined}>{it.title}</a> : it.title}</h3>
      {it.text && <p className="muted" style={{ margin: 0 }}>{it.text}</p>}
    </div>
  );
}
