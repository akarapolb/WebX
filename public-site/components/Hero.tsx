import { Icon } from "./IconSprite";
import { mediaUrl } from "@/lib/cms";

export default function Hero({ home }: { home: any }) {
  const h = home?.hero || {};
  const slides: any[] = h.slides || [];
  return (
    <section className="home-hero" aria-labelledby="hero-h">
      <div className="hero-bg" aria-hidden="true">
        {slides.length ? (
          slides.map((s, i) => (
            <div key={i} className={"hero-slide" + (i === 0 ? " is-active" : "")} style={{ backgroundImage: `url('${mediaUrl(s)}')` }} />
          ))
        ) : (
          [1, 2, 3, 4, 5].map((n) => (
            <div key={n} className={"hero-slide" + (n === 1 ? " is-active" : "")} style={{ backgroundImage: `url('/assets/image/hero-${n}.png')` }} />
          ))
        )}
      </div>
      <div className="hero-overlay" aria-hidden="true" />
      <div className="wrap">
        <span className="hero-kicker"><Icon id="i-shield" /> {h.kicker || "บริการดิจิทัลภาครัฐที่เชื่อถือได้"}</span>
        <h1 id="hero-h">
          {h.headingLine1 || "บริการรัฐบาลดิจิทัล"}
          <br /><span className="accent">{h.headingAccent || "เพื่อประชาชนทุกคน"}</span>
        </h1>
        <p className="lead">{h.lead || "ค้นหาบริการ เอกสาร และข้อมูลภาครัฐได้ในที่เดียว หรือถามผู้ช่วย AI เพื่อคำตอบที่ตรงจุด"}</p>
        <form className="hero-search" role="search" action="/search" method="get">
          <span className="ic" aria-hidden="true"><Icon id="i-search" size="lg" /></span>
          <label htmlFor="q" className="visually-hidden">ค้นหาบริการ เอกสาร หรือถาม AI</label>
          <input id="q" name="q" type="search" autoComplete="off" placeholder={h.searchPlaceholder || "ค้นหาบริการ เอกสาร หรือถาม AI…"} />
          <button className="btn btn--primary" type="submit">ค้นหา</button>
        </form>
        <p className="hero-hint"><Icon id="i-spark" /> ขับเคลื่อนด้วย AI Smart Search</p>
        {!!(h.popularTags?.length) && (
          <p className="hero-tags" aria-label="ค้นหายอดนิยม">
            <span>ยอดนิยม:</span>
            {h.popularTags.map((t: any, i: number) => <a key={i} href={t.url || "#"}>{t.label}</a>)}
          </p>
        )}
      </div>
    </section>
  );
}
