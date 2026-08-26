"use client";
import { useState } from "react";
import { Icon } from "./IconSprite";
import { fmtDateTh, fmtViewsTh, mediaUrl } from "@/lib/cms";

function NewsCard({ a, feature }: { a: any; feature?: boolean }) {
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
        <p className="news-meta"><span><Icon id="i-cal" />{fmtDateTh(a.publishDate)}</span><span><Icon id="i-eye" />{fmtViewsTh(a.views)}</span></p>
        {feature && a.excerpt && <p className="nc-excerpt">{a.excerpt}</p>}
        <a className="news-more" href="#">อ่านต่อ <Icon id="i-arrow" /></a>
      </div>
    </article>
  );
}

export default function NewsPanels({ articles }: { articles: any[] }) {
  const news = articles.filter((a) => a.kind === "news");
  const arts = articles.filter((a) => a.kind === "article");
  const [tab, setTab] = useState<"news" | "article">("news");
  const order = (list: any[]) => list.slice().sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  return (
    <section className="block" id="news" aria-labelledby="news-h">
      <h2 id="news-h" className="visually-hidden">ข่าวและบทความ</h2>
      <div className="news-toolbar">
        <div className="news-tabs" role="tablist" aria-label="หมวดข่าว">
          <button className="news-tab" role="tab" aria-selected={tab === "news"} onClick={() => setTab("news")}>DGA News</button>
          {arts.length > 0 && (
            <button className="news-tab" role="tab" aria-selected={tab === "article"} onClick={() => setTab("article")}>บทความ</button>
          )}
        </div>
      </div>

      <div className="news-panel" role="tabpanel">
        <div className="news-items">
          {order(tab === "news" ? news : arts).map((a, i) => (
            <NewsCard key={a.documentId || i} a={a} feature={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}
