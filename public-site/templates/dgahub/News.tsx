// dgahub template — news pages' design. Data, metadata and static params come
// from the WebX site kit (lib/site/news.ts); items are the tenant's articles,
// so editors write and publish them in Studio.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { mediaUrl, type Locale } from "@/lib/cms";
import { fmtDate } from "@/lib/i18n";
import { sanitizeCmsHtml } from "@/lib/sanitize";
import { newsArticles, newsParams, newsMetadata as kitNewsMetadata } from "@/lib/site/news";
import { site, base } from "./Site";

export const newsPath = site.newsPath;
const articles = (locale: Locale) => newsArticles(site, locale);
export const newsSlugs = (locale: Locale) => newsParams(site, locale);
export const newsMetadata = (locale: Locale, slug?: string): Promise<Metadata> => kitNewsMetadata(site, locale, slug);

function Head({ locale, title, lead, crumbs }: { locale: Locale; title: string; lead?: string; crumbs: { label: string; href?: string }[] }) {
  return (
    <div className="page-head">
      <div className="wrap">
        <nav className="crumbs" aria-label={locale === "en" ? "Breadcrumb" : "เส้นทางนำทาง"}>
          <ol>
            {crumbs.map((c, i) => <li key={i} aria-current={c.href ? undefined : "page"}>{c.href ? <a href={c.href}>{c.label}</a> : c.label}</li>)}
          </ol>
        </nav>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
    </div>
  );
}

export function NewsCard({ a, locale }: { a: any; locale: Locale }) {
  return (
    <li className="card dh-news-card">
      <p className="dh-news-meta">
        <time dateTime={a.publishDate}>{fmtDate(a.publishDate, locale)}</time>
        {a.categoryLabel && <span className="tag neutral">{a.categoryLabel}</span>}
      </p>
      <h3><a href={newsPath(locale, a.slug)}>{a.title}</a></h3>
      {a.excerpt && !String(a.excerpt).startsWith(String(a.title)) && <p className="muted" style={{ margin: 0 }}>{a.excerpt}</p>}
    </li>
  );
}

export async function NewsIndex({ locale }: { locale: Locale }) {
  const en = locale === "en";
  const list = await articles(locale);
  return (
    <>
      <Head locale={locale} title={en ? "News" : "ข่าว"}
        lead={en ? "Announcements, survey results and milestones in Thailand's digital government." : "ประกาศ ผลการสำรวจ และความคืบหน้าของรัฐบาลดิจิทัลไทย"}
        crumbs={[{ label: en ? "Home" : "หน้าแรก", href: base(locale) }, { label: en ? "News" : "ข่าว" }]} />
      <section className="section">
        <div className="wrap">
          {list.length
            ? <ul className="grid g3 dh-news-grid">{list.map((a) => <NewsCard key={a.slug} a={a} locale={locale} />)}</ul>
            : <p className="muted">{en ? "No news yet." : "ยังไม่มีข่าว"}</p>}
        </div>
      </section>
    </>
  );
}

export async function NewsItem({ locale, slug }: { locale: Locale; slug: string }) {
  const en = locale === "en";
  const list = await articles(locale);
  const a = list.find((x) => x.slug === slug);
  if (!a) notFound();
  const cover = mediaUrl(a.coverImage);
  const body = sanitizeCmsHtml(a.body || "");
  // The seed's placeholder body only repeats the title; don't show it twice.
  const bodyText = body.replace(/<[^>]+>/g, "").trim();
  const more = list.filter((x) => x.slug !== slug).slice(0, 3);
  return (
    <>
      <Head locale={locale} title={a.title}
        crumbs={[{ label: en ? "Home" : "หน้าแรก", href: base(locale) }, { label: en ? "News" : "ข่าว", href: newsPath(locale) }, { label: a.title }]} />
      <section className="section">
        <div className="wrap">
          <article className="dh-article">
            <p className="dh-news-meta">
              <time dateTime={a.publishDate}>{fmtDate(a.publishDate, locale)}</time>
              {a.categoryLabel && <span className="tag neutral">{a.categoryLabel}</span>}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover && <img src={cover} alt="" className="dh-article-cover" />}
            {bodyText && bodyText !== String(a.title).trim()
              ? <div className="prose" dangerouslySetInnerHTML={{ __html: body }} />
              : <p className="muted">{en ? "Full story to follow." : "รายละเอียดจะเผยแพร่เพิ่มเติม"}</p>}
            <p style={{ marginTop: 32 }}><a href={newsPath(locale)}>← {en ? "All news" : "ข่าวทั้งหมด"}</a></p>
          </article>
        </div>
      </section>
      {more.length > 0 && (
        <section className="section alt" aria-labelledby="more-news">
          <div className="wrap">
            <h2 id="more-news">{en ? "More news" : "ข่าวอื่น"}</h2>
            <ul className="grid g3 dh-news-grid">{more.map((x) => <NewsCard key={x.slug} a={x} locale={locale} />)}</ul>
          </div>
        </section>
      )}
    </>
  );
}
