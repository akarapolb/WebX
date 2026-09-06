import { mediaUrl } from "@/lib/cms";

// Simplified from the original's auto-playing dot-carousel (see the Phase 4
// plan) to a horizontally-scrollable static row — same content, same CSS
// classes, no ported carousel JS.
export default function Highlights({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <section className="hl" aria-label="ไฮไลต์ประชาสัมพันธ์">
      <div className="hl-wrap">
        <div className="hl-track" style={{ overflowX: "auto", scrollSnapType: "x mandatory" }}>
          {items.map((b, i) => {
            const img = mediaUrl(b.image);
            return (
              <a key={i} className={"hl-slide n" + ((i % 5) + 1)} href={b.url || "#"} aria-label={b.label || ""} style={{ scrollSnapAlign: "start" }}>
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" loading="lazy" />
                )}
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
