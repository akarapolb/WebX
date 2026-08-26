import { Icon } from "./IconSprite";
import { fmtDateTh, fmtViewsTh, mediaUrl } from "@/lib/cms";

// Simplified from the original's category-tab filtering (see the Phase 4
// plan) to a single grid of all videos.
export default function VideoChannel({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <section className="channel" aria-labelledby="ch-h">
      <div className="channel-inner">
        <h2 id="ch-h" className="channel-title">DGA Channel</h2>
        <div className="ch-grid">
          {items.map((v, i) => {
            const img = mediaUrl(v.thumbnail);
            return (
              <article className="ch-card" key={v.documentId || i}>
                <a className="ch-thumb" href={v.videoUrl || "#"}>
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" loading="lazy" />
                  )}
                  <span className="ch-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
                  {v.duration && <span className="ch-dur">{v.duration}</span>}
                </a>
                <div className="ch-body">
                  <h3 className="nc-title"><a href="#">{v.title}</a></h3>
                  <p className="news-meta"><span><Icon id="i-cal" />{fmtDateTh(v.date)}</span><span><Icon id="i-eye" />{fmtViewsTh(v.views)} ครั้ง</span></p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
