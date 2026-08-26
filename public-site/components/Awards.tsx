import { Icon } from "./IconSprite";
import { mediaUrl } from "@/lib/cms";

export default function Awards({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <section className="auditorium" aria-labelledby="aud-h">
      <div className="aud-inner">
        <div className="aud-head">
          <span className="aud-eyebrow">ความภาคภูมิใจของเรา</span>
          <h2 id="aud-h" className="aud-title">DGA Auditorium</h2>
          <p className="aud-sub">รางวัลและการยอมรับระดับชาติ ที่ตอกย้ำความเป็นผู้นำด้านรัฐบาลดิจิทัลของประเทศไทย</p>
        </div>
        <div className="awards">
          {items.map((w, i) => {
            const img = mediaUrl(w.image);
            return (
              <article className="award" key={w.documentId || i}>
                <div className="award-stage">
                  <span className="award-spot" aria-hidden="true" />
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="award-img" src={img} alt={w.name} loading="lazy" />
                  ) : (
                    <span className="award-ph" aria-hidden="true"><Icon id="i-trophy" /></span>
                  )}
                </div>
                <div className="award-info">
                  <b className="award-name">{w.name}</b>
                  <span className="award-cat">{w.categoryText || ""}</span>
                  <span className="award-year">{w.year || ""}</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
