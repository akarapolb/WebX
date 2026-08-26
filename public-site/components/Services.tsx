import { Icon } from "./IconSprite";

export default function Services({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <section className="block" id="services" aria-labelledby="svc-h">
      <div className="block__head">
        <div><span className="eyebrow">บริการ</span><h2 id="svc-h">บริการยอดนิยม</h2></div>
      </div>
      <ul className="svc-grid">
        {items.map((s, i) => (
          <li key={i}>
            <a className={"svc t-" + (s.colorTheme || "blue")} href={s.url || "#"}>
              <span className="ic" aria-hidden="true"><Icon id={s.icon || "i-grid"} size="lg" /></span>
              <span><b>{s.title}</b><span>{s.description || ""}</span></span>
              <span className="go" aria-hidden="true"><Icon id="i-arrow" /></span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
