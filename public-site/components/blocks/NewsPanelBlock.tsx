"use client";
// Direct port of components/NewsPanels.tsx's interactivity (tab state, the
// featured-first `order()` sort) onto block-driven framing config — same
// exact classNames/JSX, articles still come from the live `homeData.articles`
// fetch, not from the block's own record.
import { useState } from "react";
import { Icon } from "../IconSprite";
import { fmtViewsTh, mediaUrl } from "@/lib/cms";
import { fmtDate, t, type Locale } from "@/lib/i18n";

function NewsCard({ a, feature, locale }: { a: any; feature?: boolean; locale: Locale }) {
  const img = mediaUrl(a.coverImage);
  return (
    <article className={"news-card" + (feature ? " news-card--feature" : "")}>
      <a className="news-thumb" href="#">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" />
        ) : (
          <span className="ph n3"><Icon id="i-doc" /></span>
        )}
        {a.categoryLabel && <span className="cat">{a.categoryLabel}</span>}
      </a>
      <div className="nc-body">
        <h3 className="nc-title"><a href="#">{a.title}</a></h3>
        <p className="news-meta"><span><Icon id="i-cal" />{fmtDate(a.publishDate, locale)}</span><span><Icon id="i-eye" />{fmtViewsTh(a.views)}</span></p>
        {feature && a.excerpt && <p className="nc-excerpt">{a.excerpt}</p>}
        <a className="news-more" href="#">{t("readMore", locale)} <Icon id="i-arrow" /></a>
      </div>
    </article>
  );
}

export default function NewsPanelBlock({ articles, newsTabLabel, articleTabLabel, locale = "th" }: { articles: any[]; newsTabLabel?: string; articleTabLabel?: string; locale?: Locale }) {
  const list = articles || [];
  const news = list.filter((a) => a.kind === "news");
  const arts = list.filter((a) => a.kind === "article");
  const [tab, setTab] = useState<"news" | "article">("news");
  const order = (l: any[]) => l.slice().sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  return (
    <section className="block" id="news" aria-labelledby="pgb-news-h">
      <h2 id="pgb-news-h" className="visually-hidden">{t("newsHeading", locale)}</h2>
      <div className="news-toolbar">
        <div className="news-tabs" role="tablist" aria-label={t("newsTabs", locale)}>
          <button className="news-tab" role="tab" aria-selected={tab === "news"} onClick={() => setTab("news")}>{newsTabLabel || "DGA News"}</button>
          {arts.length > 0 && (
            <button className="news-tab" role="tab" aria-selected={tab === "article"} onClick={() => setTab("article")}>{articleTabLabel || t("articleTab", locale)}</button>
          )}
        </div>
      </div>

      <div className="news-panel" role="tabpanel">
        <div className="news-items">
          {order(tab === "news" ? news : arts).map((a, i) => (
            <NewsCard key={a.documentId || i} a={a} feature={i === 0} locale={locale} />
          ))}
        </div>
      </div>
    </section>
  );
}
