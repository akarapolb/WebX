import { Icon } from "./IconSprite";
import { mediaUrl } from "@/lib/cms";

export default function Featured({ home }: { home: any }) {
  const p = home?.featuredPromo;
  if (!p) return null;
  return (
    <section className="featured" aria-labelledby="feat-h">
      <div className="panel">
        <div>
          <span className="eyebrow" style={{ color: "var(--c-primary)", fontWeight: 700, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>{p.eyebrow || ""}</span>
          <h2 id="feat-h">{p.title}</h2>
          <p>{p.description || ""}</p>
          {!!(p.items?.length) && (
            <ul className="feat-list">
              {p.items.map((li: string, i: number) => (
                <li key={i}><span className="ck" aria-hidden="true"><Icon id="i-check" /></span>{li}</li>
              ))}
            </ul>
          )}
          <div className="demo-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
            <a className="btn btn--primary" href={p.primaryUrl || "#"}>{p.primaryLabel || ""} <Icon id="i-arrow" /></a>
            {p.secondaryLabel && <a className="btn btn--ghost" href={p.secondaryUrl || "#"}>{p.secondaryLabel}</a>}
          </div>
        </div>
        {mediaUrl(p.image) && (
          <div className="art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(p.image)} alt={p.title || ""} loading="lazy" />
          </div>
        )}
      </div>
    </section>
  );
}
