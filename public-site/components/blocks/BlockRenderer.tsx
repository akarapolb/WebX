// Generic renderer for the same 6 `block.*` dynamiczone components WebX
// Studio's Visual Builder edits (webx-studio/components/VisualBuilder.tsx) —
// a type-keyed registry, same idea as templates/orst/Blocks.tsx, but reading
// real Strapi-authored content instead of static repo JSON. Pilot scope only
// actually feeds this `block.hero`/`block.feature-grid`, but all 6 are
// implemented so this is a genuine renderer, not a two-case special case.
import { Icon } from "../IconSprite";
import { mediaUrl, fmtDateTh, fmtViewsTh, getCollectionEntries, SLUGGED_PLURALS } from "@/lib/cms";
import NewsPanelBlock from "./NewsPanelBlock";
import FaqBlock from "./FaqBlock";
import EmbedBlock from "./EmbedBlock";
import FormBlock from "./FormBlock";
import LocationMap from "../LocationMap";
import TabsAccordionBlock from "./TabsAccordionBlock";

const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");

type BlockTypeDef = { key: string; name?: string; icon?: string; fieldsSchema?: { key: string; type: string; label?: string }[]; template?: string };
type CustomIconDef = { key: string; name?: string; imageUrl?: string };

// Feature-grid items store the full built-in sprite id ("i-grid"); stat-row
// items store the short form ("grid", prefixed with "i-" at render time) —
// two different existing conventions, not something to normalize here. Kept
// in sync by hand with webx-studio/components/blockPreview/blocks.tsx's own
// copy of this same resolver (same duplication convention as interpolate()).
function AnyIcon({ id, customIcons, size, builtinPrefix }: { id: string; customIcons?: Record<string, CustomIconDef>; size?: "lg" | ""; builtinPrefix?: string }) {
  const ic = customIcons?.[id];
  if (ic?.imageUrl) return <img src={mediaUrl({ url: ic.imageUrl })} alt="" className={"icon" + (size ? " icon--" + size : "")} style={{ objectFit: "contain" }} />;
  return <Icon id={(builtinPrefix || "") + id} size={size} />;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]));

// Same interpolation rules as VisualBuilder.tsx's own `interpolate()` (kept
// in sync by hand — the custom-block template format is the same contract
// on both the editor and the render side).
function interpolate(bt: BlockTypeDef, props: Record<string, any>): string {
  const rich = new Set((bt.fieldsSchema || []).filter((f) => f.type === "richtext").map((f) => f.key));
  const imgs = new Set((bt.fieldsSchema || []).filter((f) => f.type === "image").map((f) => f.key));
  return (bt.template || "").replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, k) => {
    const v = props?.[k];
    if (v == null) return "";
    if (imgs.has(k)) { const u = mediaUrl(v); return u || ""; }
    return rich.has(k) ? String(v) : esc(String(v));
  });
}

// block-type is tenant-scoped OR global (nullable tenant) — the same shape
// VisualBuilder.tsx's loadTypes() queries client-side; not expressible via
// lib/cms.ts's plain get() helper, so a direct fetch here too.
async function loadCustomTypes(tenant: string): Promise<Record<string, BlockTypeDef>> {
  try {
    const qs = "?pagination[pageSize]=100&filters[$or][0][tenant][key][$eq]=" + encodeURIComponent(tenant) + "&filters[$or][1][tenant][id][$null]=true";
    const r = await fetch(STRAPI + "/api/block-types" + qs, { headers: { Accept: "application/json" } });
    if (!r.ok) return {};
    const j = await r.json();
    const out: Record<string, BlockTypeDef> = {};
    for (const e of j.data || []) {
      const a = e.attributes || e;
      out[a.key] = { key: a.key, name: a.name, icon: a.icon, fieldsSchema: a.fieldsSchema || [], template: a.template || "" };
    }
    return out;
  } catch { return {}; }
}

async function loadCustomIcons(tenant: string): Promise<Record<string, CustomIconDef>> {
  try {
    const qs = "?pagination[pageSize]=100&populate=image&filters[$or][0][tenant][key][$eq]=" + encodeURIComponent(tenant) + "&filters[$or][1][tenant][id][$null]=true";
    const r = await fetch(STRAPI + "/api/icons" + qs, { headers: { Accept: "application/json" } });
    if (!r.ok) return {};
    const j = await r.json();
    const out: Record<string, CustomIconDef> = {};
    for (const e of j.data || []) {
      const a = e.attributes || e;
      out[a.key] = { key: a.key, name: a.name, imageUrl: a.image?.url };
    }
    return out;
  } catch { return {}; }
}

function HeroBlock({ b }: { b: any }) {
  const img = mediaUrl(b.image);
  return (
    <section className="home-hero" aria-labelledby="pgb-hero-h">
      <div className="hero-bg" aria-hidden="true">
        <div className="hero-slide is-active" style={img ? { backgroundImage: `url('${img}')` } : undefined} />
      </div>
      <div className="hero-overlay" aria-hidden="true" />
      <div className={"wrap" + (b.align === "left" ? " align-left" : "")}>
        {b.kicker && <span className="hero-kicker"><Icon id="i-shield" /> {b.kicker}</span>}
        <h1 id="pgb-hero-h">{b.heading}</h1>
        {b.subheading && <p className="lead">{b.subheading}</p>}
        {b.ctaLabel && <a className="btn btn--primary" href={b.ctaUrl || "#"}>{b.ctaLabel}</a>}
      </div>
    </section>
  );
}

function RichTextBlock({ b }: { b: any }) {
  return <div className="block" dangerouslySetInnerHTML={{ __html: b.body || "" }} />;
}

function ImageBlock({ b }: { b: any }) {
  const url = mediaUrl(b.image);
  if (!url) return null;
  return (
    <figure className={"block" + (b.full ? " block--full" : "")}>
      <img src={url} alt={b.caption || ""} style={{ maxWidth: "100%" }} />
      {b.caption && <figcaption>{b.caption}</figcaption>}
    </figure>
  );
}

function CtaBannerBlock({ b }: { b: any }) {
  return (
    <section className={"block cta-banner cta-banner--" + (b.theme || "primary")}>
      <div style={{ flex: 1 }}>
        {b.heading && <b>{b.heading}</b>}
        {b.text && <p>{b.text}</p>}
      </div>
      {b.buttonLabel && <a className="btn btn--primary" href={b.buttonUrl || "#"}>{b.buttonLabel}</a>}
    </section>
  );
}

function FeatureGridBlock({ b, customIcons }: { b: any; customIcons?: Record<string, CustomIconDef> }) {
  const items: any[] = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return null;
  return (
    <section className="block" id="services" aria-labelledby="pgb-svc-h">
      <div className="block__head">
        <div>{b.heading && <h2 id="pgb-svc-h">{b.heading}</h2>}</div>
      </div>
      <ul className="svc-grid">
        {items.map((it, i) => (
          <li key={i}>
            <a className={"svc t-" + (it.colorTheme || "blue")} href={it.url || "#"}>
              <span className="ic" aria-hidden="true"><AnyIcon id={it.icon || "i-grid"} customIcons={customIcons} size="lg" /></span>
              <span><b>{it.title}</b><span>{it.text || ""}</span></span>
              <span className="go" aria-hidden="true"><Icon id="i-arrow" /></span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Verbatim port of components/Highlights.tsx — reads the live `homeData.banners`
// fetch (same tenant's active, order-sorted banners), block itself has no fields.
function HighlightsBlock({ items }: { items: any[] }) {
  const list = items || [];
  if (!list.length) return null;
  return (
    <section className="hl" aria-label="ไฮไลต์ประชาสัมพันธ์">
      <div className="hl-wrap">
        <div className="hl-track" style={{ overflowX: "auto", scrollSnapType: "x mandatory" }}>
          {list.map((bn, i) => {
            const img = mediaUrl(bn.image);
            return (
              <a key={i} className={"hl-slide n" + ((i % 5) + 1)} href={bn.url || "#"} aria-label={bn.label || ""} style={{ scrollSnapAlign: "start" }}>
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

// Verbatim port of components/Stats.tsx, but the 4 items now come from the
// block's own (static) fields instead of a hardcoded array.
function StatRowBlock({ b, customIcons }: { b: any; customIcons?: Record<string, CustomIconDef> }) {
  const items: any[] = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return null;
  return (
    <section className="stats-band" aria-label="สถิติการให้บริการ">
      <div className="wrap">
        {items.map((s, i) => (
          <div className="stat-item" key={i}>
            <span className="ic" aria-hidden="true"><AnyIcon id={s.icon || "users"} customIcons={customIcons} builtinPrefix="i-" size="lg" /></span>
            <div className="stat-body">
              <b className="stat-num">{s.value}</b>
              <span className="stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Verbatim port of components/VideoChannel.tsx — reads the live `homeData.videos`
// fetch; `b.title` is the block's only field.
function VideoChannelBlock({ b, items }: { b: any; items: any[] }) {
  const list = items || [];
  if (!list.length) return null;
  return (
    <section className="channel" aria-labelledby="pgb-ch-h">
      <div className="channel-inner">
        <h2 id="pgb-ch-h" className="channel-title">{b.title || "DGA Channel"}</h2>
        <div className="ch-grid">
          {list.map((v, i) => {
            const img = mediaUrl(v.thumbnail);
            const href = mediaUrl(v.videoFile) || v.videoUrl || "#";
            return (
              <article className="ch-card" key={v.documentId || i}>
                <a className="ch-thumb" href={href} target={mediaUrl(v.videoFile) ? "_blank" : undefined} rel={mediaUrl(v.videoFile) ? "noreferrer" : undefined}>
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

// Verbatim port of components/Awards.tsx — reads the live `homeData.awards`
// fetch; `b.eyebrow`/`b.title`/`b.subtitle` are the block's own fields.
function AwardsBlock({ b, items }: { b: any; items: any[] }) {
  const list = items || [];
  if (!list.length) return null;
  return (
    <section className="auditorium" aria-labelledby="pgb-aud-h">
      <div className="aud-inner">
        <div className="aud-head">
          <span className="aud-eyebrow">{b.eyebrow || "ความภาคภูมิใจของเรา"}</span>
          <h2 id="pgb-aud-h" className="aud-title">{b.title || "DGA Auditorium"}</h2>
          <p className="aud-sub">{b.subtitle || "รางวัลและการยอมรับระดับชาติ ที่ตอกย้ำความเป็นผู้นำด้านรัฐบาลดิจิทัลของประเทศไทย"}</p>
        </div>
        <div className="awards">
          {list.map((w, i) => {
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

// Verbatim port of components/Featured.tsx, including its inline style
// objects (not in the shared stylesheet) — fully static block content.
function FeaturedPromoBlock({ b }: { b: any }) {
  return (
    <section className="featured" aria-labelledby="pgb-feat-h">
      <div className="panel">
        <div>
          <span className="eyebrow" style={{ color: "var(--c-primary)", fontWeight: 700, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>{b.eyebrow || ""}</span>
          <h2 id="pgb-feat-h">{b.title}</h2>
          <p>{b.description || ""}</p>
          {!!(Array.isArray(b.items) && b.items.length) && (
            <ul className="feat-list">
              {b.items.map((li: string, i: number) => (
                <li key={i}><span className="ck" aria-hidden="true"><Icon id="i-check" /></span>{li}</li>
              ))}
            </ul>
          )}
          <div className="demo-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
            <a className="btn btn--primary" href={b.primaryUrl || "#"}>{b.primaryLabel || ""} <Icon id="i-arrow" /></a>
            {b.secondaryLabel && <a className="btn btn--ghost" href={b.secondaryUrl || "#"}>{b.secondaryLabel}</a>}
          </div>
        </div>
        {mediaUrl(b.image) && (
          <div className="art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(b.image)} alt={b.title || ""} loading="lazy" />
          </div>
        )}
      </div>
    </section>
  );
}

// Testimonials — a grid of quote cards, same "framing block + repeatable
// item" shape as AwardsBlock above, just admin-authored instead of pulled
// from a live collection.
function TestimonialsBlock({ b }: { b: any }) {
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return null;
  return (
    <section className="block tm-block" aria-label={b.heading || ""}>
      {b.heading && <h2 className="tm-heading">{b.heading}</h2>}
      <div className="tm-grid">
        {items.map((it: any, i: number) => {
          const img = mediaUrl(it.avatar);
          return (
            <figure className="tm-card" key={i}>
              <blockquote className="tm-quote">{it.quote}</blockquote>
              <figcaption className="tm-author">
                {img && <img className="tm-avatar" src={img} alt="" loading="lazy" />}
                <div>
                  {it.author && <b className="tm-name">{it.author}</b>}
                  {it.role && <span className="tm-role">{it.role}</span>}
                </div>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

// Logo cloud — a simple wrapped row of partner/related-org logos.
function LogoCloudBlock({ b }: { b: any }) {
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return null;
  return (
    <section className="block lc-block" aria-label={b.heading || ""}>
      {b.heading && <h2 className="lc-heading">{b.heading}</h2>}
      <div className="lc-row">
        {items.map((it: any, i: number) => {
          const img = mediaUrl(it.logo);
          if (!img) return null;
          const inner = <img className="lc-img" src={img} alt={it.name || ""} loading="lazy" />;
          return it.url
            ? <a className="lc-item" key={i} href={it.url} target="_blank" rel="noopener noreferrer">{inner}</a>
            : <span className="lc-item" key={i}>{inner}</span>;
        })}
      </div>
    </section>
  );
}

// Team grid — photo+name+role+bio cards.
function TeamGridBlock({ b }: { b: any }) {
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return null;
  return (
    <section className="block tg-block" aria-label={b.heading || ""}>
      {b.heading && <h2 className="tg-heading">{b.heading}</h2>}
      <div className="tg-grid">
        {items.map((it: any, i: number) => {
          const img = mediaUrl(it.photo);
          return (
            <article className="tg-card" key={i}>
              {img ? <img className="tg-photo" src={img} alt="" loading="lazy" /> : <div className="tg-photo tg-photo--ph" aria-hidden="true" />}
              <b className="tg-name">{it.name}</b>
              {it.role && <span className="tg-role">{it.role}</span>}
              {it.bio && <p className="tg-bio">{it.bio}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Pull quote — one standalone quote, optional attribution. The decorative
// quotation mark is CSS (::before on .bq-quote), not literal text, so the
// content itself stays plain quoted text with no baked-in punctuation.
function BlockquoteBlock({ b }: { b: any }) {
  if (!b.quote) return null;
  return (
    <section className="block bq-block">
      <blockquote className="bq-quote">{b.quote}</blockquote>
      {b.attribution && <cite className="bq-attribution">{b.attribution}</cite>}
    </section>
  );
}

// Spacer/divider — a blank vertical gap, or a horizontal rule. No heading,
// no content — a pure layout utility block.
function SpacerBlock({ b }: { b: any }) {
  const size = b.size === "sm" || b.size === "lg" ? b.size : "md";
  if (b.style === "line") return <hr className={"spc-line spc-" + size} />;
  return <div className={"spc-space spc-" + size} aria-hidden="true" />;
}

// Comparison / pricing — parallel option cards, each with its own feature
// checklist (not a shared row-by-row matrix — see the plan's v1 scope note:
// a true synchronized matrix needs real 2D sidebar editing UX, deliberately
// out of scope here). Covers both a pricing table (price/period/CTA filled
// in) and a lighter side-by-side comparison (left blank) with one shape.
function ComparisonBlock({ b }: { b: any }) {
  const columns = Array.isArray(b.columns) ? b.columns : [];
  if (!columns.length) return null;
  return (
    <section className="block cmp-block" aria-label={b.heading || ""}>
      {b.heading && <h2 className="cmp-heading">{b.heading}</h2>}
      <div className="cmp-grid">
        {columns.map((c: any, i: number) => {
          const features: string[] = Array.isArray(c.features) ? c.features : [];
          return (
            <article className={"cmp-col" + (c.highlight ? " cmp-col--highlight" : "")} key={i}>
              {c.highlight && <span className="cmp-badge">แนะนำ</span>}
              <h3 className="cmp-name">{c.name}</h3>
              {c.price && <div className="cmp-price">{c.price}{c.period && <span className="cmp-period">/{c.period}</span>}</div>}
              {c.description && <p className="cmp-desc">{c.description}</p>}
              {features.length > 0 && (
                <ul className="cmp-features">
                  {features.map((f, k) => <li key={k}><Icon id="i-check" />{f}</li>)}
                </ul>
              )}
              {c.ctaLabel && <a className={"btn " + (c.highlight ? "btn--primary" : "btn--ghost")} href={c.ctaUrl || "#"}>{c.ctaLabel}</a>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Webflow-style "Collection List" — binds to any content type (config is
// field-name strings picked in the Visual Builder, see VisualBuilder.tsx's
// LISTABLE_UIDS/field-mapping selects), no per-type component needed. Cards
// only get a real <a> when linkField resolves to a truthy value (most
// content types here have no link-worthy field at all, e.g. award/faq) —
// matching AwardsBlock's own existing no-link precedent, not a regression.
function CollectionListBlock({ b, items, tenant }: { b: any; items: any[]; tenant: string }) {
  if (!items.length) return null;
  if (b.layout === "map" && b.contentTypeUid === "api::location.location") {
    return (
      <section className="block cl-block" aria-label={b.heading || ""}>
        {b.heading && <h2 className="cl-heading">{b.heading}</h2>}
        <LocationMap entries={items} />
      </section>
    );
  }
  return (
    <section className="block cl-block" aria-label={b.heading || ""}>
      {b.heading && <h2 className="cl-heading">{b.heading}</h2>}
      <div className="cl-grid">
        {items.map((e, i) => {
          const img = b.imageField ? mediaUrl(e[b.imageField]) : "";
          const href = b.linkToDetail && b.pluralName
            ? "/" + tenant + "/" + b.pluralName + "/" + ((SLUGGED_PLURALS.has(b.pluralName) && e.slug) || e.documentId)
            : (b.linkField ? e[b.linkField] : "");
          const inner = (
            <>
              {img && (
                <div className="cl-thumb">
                  <img src={img} alt="" loading="lazy" />
                  {b.videoUrlField && e[b.videoUrlField] && (
                    <span className="ch-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
                  )}
                </div>
              )}
              <div className="cl-body">
                <h3 className="cl-title">{b.titleField ? e[b.titleField] : ""}</h3>
                {b.excerptField && e[b.excerptField] && <p className="cl-excerpt">{String(e[b.excerptField]).replace(/<[^>]+>/g, "")}</p>}
                {b.dateField && e[b.dateField] && <p className="cl-meta">{fmtDateTh(e[b.dateField])}</p>}
              </div>
            </>
          );
          return href
            ? <a className="cl-card" key={e.documentId || i} href={href}>{inner}</a>
            : <article className="cl-card" key={e.documentId || i}>{inner}</article>;
        })}
      </div>
    </section>
  );
}

function CustomBlock({ b, types }: { b: any; types: Record<string, BlockTypeDef> }) {
  const bt = types[b.typeKey];
  if (!bt) return null;
  return <div className="block" dangerouslySetInnerHTML={{ __html: interpolate(bt, b.props || {}) }} />;
}

// `homeData` is the same object `getHomeData()` already produces for
// HomePage.tsx's legacy path — passed straight through, not re-fetched, so
// the "live-query" blocks below (highlights/news-panel/video-channel/
// awards/faq) show exactly the same collection data the legacy components
// would, with the same sort/filter/pageSize.
export default async function BlockRenderer({ blocks, tenant, homeData }: { blocks: any[]; tenant: string; homeData?: any }) {
  const list = Array.isArray(blocks) ? blocks : [];
  const needsCustomTypes = list.some((b) => b.__component === "block.custom");
  const needsIcons = list.some((b) => b.__component === "block.feature-grid" || b.__component === "block.stat-row");
  const clIdxs: number[] = [];
  list.forEach((b, i) => { if (b.__component === "block.collection-list" && b.pluralName) clIdxs.push(i); });
  const [customTypes, customIcons, clResults] = await Promise.all([
    needsCustomTypes ? loadCustomTypes(tenant) : Promise.resolve({}),
    needsIcons ? loadCustomIcons(tenant) : Promise.resolve({}),
    Promise.all(clIdxs.map((i) => getCollectionEntries(tenant, list[i].pluralName, {
      sortField: list[i].sortField, sortDir: list[i].sortDir, pageSize: list[i].pageSize, populateField: list[i].imageField,
    }))),
  ]);
  const clByIdx = new Map<number, any[]>(clIdxs.map((i, k) => [i, clResults[k]]));
  const hd = homeData || {};
  return (
    <>
      {list.map((b, i) => {
        switch (b.__component) {
          case "block.hero": return <HeroBlock key={i} b={b} />;
          case "block.richtext": return <RichTextBlock key={i} b={b} />;
          case "block.image": return <ImageBlock key={i} b={b} />;
          case "block.cta-banner": return <CtaBannerBlock key={i} b={b} />;
          case "block.feature-grid": return <FeatureGridBlock key={i} b={b} customIcons={customIcons} />;
          case "block.custom": return <CustomBlock key={i} b={b} types={customTypes} />;
          case "block.highlights": return <HighlightsBlock key={i} items={hd.banners} />;
          case "block.stat-row": return <StatRowBlock key={i} b={b} customIcons={customIcons} />;
          case "block.news-panel": return <NewsPanelBlock key={i} articles={hd.articles} newsTabLabel={b.newsTabLabel} articleTabLabel={b.articleTabLabel} />;
          case "block.video-channel": return <VideoChannelBlock key={i} b={b} items={hd.videos} />;
          case "block.awards": return <AwardsBlock key={i} b={b} items={hd.awards} />;
          case "block.faq": return <FaqBlock key={i} faqs={hd.faqs} eyebrow={b.eyebrow} title={b.title} />;
          case "block.featured-promo": return <FeaturedPromoBlock key={i} b={b} />;
          case "block.embed": return <EmbedBlock key={i} b={b} />;
          case "block.collection-list": return <CollectionListBlock key={i} b={b} items={clByIdx.get(i) || []} tenant={tenant} />;
          case "block.form": return <FormBlock key={i} b={b} tenant={tenant} />;
          case "block.testimonials": return <TestimonialsBlock key={i} b={b} />;
          case "block.logo-cloud": return <LogoCloudBlock key={i} b={b} />;
          case "block.team-grid": return <TeamGridBlock key={i} b={b} />;
          case "block.blockquote": return <BlockquoteBlock key={i} b={b} />;
          case "block.spacer": return <SpacerBlock key={i} b={b} />;
          case "block.tabs": return <TabsAccordionBlock key={i} b={b} />;
          case "block.comparison": return <ComparisonBlock key={i} b={b} />;
          default: return null;
        }
      })}
    </>
  );
}
