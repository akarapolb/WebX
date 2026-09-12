"use client";
// Hand-ported copy of public-site/components/blocks/BlockRenderer.tsx +
// NewsPanelBlock.tsx + FaqBlock.tsx — same classNames, same JSX, kept in
// sync by hand (matches this codebase's existing convention for
// interpolate(), already duplicated between VisualBuilder.tsx and
// BlockRenderer.tsx). Real differences from the source, all required by
// running inside the Visual Builder instead of public-site:
//   - Not an async Server Component — customTypes is passed in as a prop
//     (VisualBuilder.tsx already loads it via loadTypes()) instead of
//     fetched here.
//   - mediaUrl() resolves through the existing /api/strapi proxy
//     (matches how VisualBuilder.tsx's OWN image previews already resolve
//     Strapi media), not directly against STRAPI_URL — this iframe's
//     srcdoc document inherits webx-studio's own origin as its relative-URL
//     base, so the proxy path resolves correctly.
//   - Every block component takes an optional `edit?: EditBag` prop (see
//     ./editing.ts). The rule for porting a change from BlockRenderer.tsx:
//     wrap-only. A field's real rendering logic never changes — only ever
//     wrapped as `{edit ? <EditableText edit={edit} path={[...]} value={x}/> : x}`
//     (or EditableImage for images), and the block's root element gains a
//     `className`/`onClick` pair for selection. If a port ever needs more
//     than a wrap to add editability, that's a sign the two files are about
//     to diverge beyond this convention — stop and reconsider before
//     proceeding, rather than letting BlockRenderer.tsx pick up edit-only
//     markup by accident.
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "./IconSpriteDefs";
import EditableText from "./EditableText";
import EditableImage from "./EditableImage";
import EditableIconPicker from "./EditableIconPicker";
import type { EditBag, Path } from "./editing";
import { FORM_FIELD_DEFS } from "../../lib/formFieldDefs";
import { sanitizeCmsHtml, jsonForScript } from "../../lib/sanitize";

function mediaUrl(m: any): string {
  if (!m) return "";
  const u = m.url || m?.data?.attributes?.url || "";
  if (!u) return "";
  return u.indexOf("http") === 0 ? u : "/api/strapi" + u;
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function fmtDateTh(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const yy = (d.getFullYear() + 543) % 100;
  return d.getDate() + " " + TH_MONTHS[d.getMonth()] + " " + yy;
}
function fmtViewsTh(n?: number): string {
  return Number(n || 0).toLocaleString("th-TH");
}

type BlockTypeDef = { key: string; name?: string; icon?: string; fieldsSchema?: { key: string; type: string; label?: string }[]; template?: string };
type CustomIconDef = { key: string; name?: string; imageUrl?: string };

// Feature-grid items store the full built-in sprite id ("i-grid"); stat-row
// items store the short form ("grid", prefixed with "i-" at render time) —
// two different existing conventions, not something to normalize here. A
// custom icon's key is checked against the RAW stored value either way,
// before any built-in prefixing, so it works regardless of which shape.
function AnyIcon({ id, customIcons, size, builtinPrefix }: { id: string; customIcons?: Record<string, CustomIconDef>; size?: "lg" | ""; builtinPrefix?: string }) {
  const ic = customIcons?.[id];
  if (ic?.imageUrl) return <img src={mediaUrl({ url: ic.imageUrl })} alt="" className={"icon" + (size ? " icon--" + size : "")} style={{ objectFit: "contain" }} />;
  return <Icon id={(builtinPrefix || "") + id} size={size} />;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]));

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

// Root-element selection className/onClick — every editable block's outer
// tag spreads this. Not applied to click-to-select-only blocks any
// differently: the SAME helper, since selection is orthogonal to whether a
// block has inline-editable fields.
function editRoot(edit?: EditBag) {
  if (!edit) return {};
  return {
    className: "pvb-editable" + (edit.active ? " pvb-sel" : "") + (edit.agentDraft ? " pvb-agent-draft" : ""),
    onClick: (e: any) => { e.stopPropagation(); edit.onSelect(); },
  };
}
function cls(base: string, edit?: EditBag) {
  return edit ? base + " pvb-editable" + (edit.active ? " pvb-sel" : "") + (edit.agentDraft ? " pvb-agent-draft" : "") : base;
}

function HeroBlock({ b, edit }: { b: any; edit?: EditBag }) {
  const img = mediaUrl(b.image);
  return (
    <section className={cls("home-hero", edit)} aria-labelledby="pgb-hero-h" onClick={editRoot(edit).onClick}>
      <div className="hero-bg" aria-hidden="true">
        <div className="hero-slide is-active" style={img ? { backgroundImage: `url('${img}')` } : undefined} />
        {edit && (
          <label className="pvb-bg-overlay" onClick={(e) => e.stopPropagation()}>
            <span>Change image</span>
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) edit.onImagePick(["image"], f); }} />
          </label>
        )}
      </div>
      <div className="hero-overlay" aria-hidden="true" />
      <div className={"wrap" + (b.align === "left" ? " align-left" : "")}>
        {(b.kicker || edit) && (
          <span className="hero-kicker"><Icon id="i-shield" /> <EditableText edit={edit} path={["kicker"]} value={b.kicker || ""} placeholder="KICKER" /></span>
        )}
        <h1 id="pgb-hero-h"><EditableText edit={edit} path={["heading"]} value={b.heading || ""} placeholder="Heading" /></h1>
        {(b.subheading || edit) && <p className="lead"><EditableText edit={edit} path={["subheading"]} value={b.subheading || ""} placeholder="Subheading…" /></p>}
        {(b.ctaLabel || edit) && <a className="btn btn--primary" href={b.ctaUrl || "#"}><EditableText edit={edit} path={["ctaLabel"]} value={b.ctaLabel || ""} placeholder="Button" /></a>}
      </div>
    </section>
  );
}

function RichTextBlock({ b, edit }: { b: any; edit?: EditBag }) {
  return <div className={cls("block", edit)} onClick={editRoot(edit).onClick} dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(b.body) }} />;
}

function ImageBlock({ b, edit }: { b: any; edit?: EditBag }) {
  const url = mediaUrl(b.image);
  if (!url && !edit) return null;
  return (
    <figure className={cls("block" + (b.full ? " block--full" : ""), edit)} onClick={editRoot(edit).onClick}>
      <EditableImage edit={edit} path={["image"]} src={url} alt={b.caption || ""} style={{ maxWidth: "100%" }} />
      {(b.caption || edit) && <figcaption><EditableText edit={edit} path={["caption"]} value={b.caption || ""} placeholder="Caption…" /></figcaption>}
    </figure>
  );
}

function CtaBannerBlock({ b, edit }: { b: any; edit?: EditBag }) {
  return (
    <section className={cls("block cta-banner cta-banner--" + (b.theme || "primary"), edit)} onClick={editRoot(edit).onClick}>
      <div style={{ flex: 1 }}>
        {(b.heading || edit) && <b><EditableText edit={edit} path={["heading"]} value={b.heading || ""} placeholder="Heading" /></b>}
        {(b.text || edit) && <p><EditableText edit={edit} path={["text"]} value={b.text || ""} placeholder="Text…" /></p>}
      </div>
      {(b.buttonLabel || edit) && <a className="btn btn--primary" href={b.buttonUrl || "#"}><EditableText edit={edit} path={["buttonLabel"]} value={b.buttonLabel || ""} placeholder="Button" /></a>}
    </section>
  );
}

function FeatureGridBlock({ b, edit, customIcons }: { b: any; edit?: EditBag; customIcons?: Record<string, CustomIconDef> }) {
  const items: any[] = Array.isArray(b.items) ? b.items : [];
  if (!items.length && !edit) return null;
  return (
    <section className={cls("block", edit)} id="services" aria-labelledby="pgb-svc-h" onClick={editRoot(edit).onClick}>
      <div className="block__head">
        <div>{(b.heading || edit) && <h2 id="pgb-svc-h"><EditableText edit={edit} path={["heading"]} value={b.heading || ""} placeholder="Section title" /></h2>}</div>
      </div>
      <ul className="svc-grid">
        {items.map((it, i) => (
          <li key={i} className={edit ? "pvb-arritem" : undefined}>
            <a className={"svc t-" + (it.colorTheme || "blue")} href={it.url || "#"}>
              <span className="ic pvb-iconwrap" aria-hidden="true">
                <AnyIcon id={it.icon || "i-grid"} customIcons={customIcons} size="lg" />
                {edit && <EditableIconPicker edit={edit} path={["items", i, "icon"]} value={it.icon || "i-grid"} kind="feature" customIcons={customIcons} />}
              </span>
              <span>
                <b><EditableText edit={edit} path={["items", i, "title"]} value={it.title || ""} placeholder="Title" /></b>
                <span><EditableText edit={edit} path={["items", i, "text"]} value={it.text || ""} placeholder="Description" /></span>
              </span>
              <span className="go" aria-hidden="true"><Icon id="i-arrow" /></span>
            </a>
            {edit && <button type="button" className="pvb-arr-rm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); edit.onArrayRemove(["items"], i); }} title="Remove item">×</button>}
          </li>
        ))}
      </ul>
      {edit && <button type="button" className="pvb-arr-add" onClick={(e) => { e.stopPropagation(); edit.onArrayAdd(["items"], { title: "Feature", text: "" }); }}>+ Add item</button>}
    </section>
  );
}

// Click-to-select only — its content comes from a separate live collection
// (banners), not from any of the block's own fields (it has none).
function HighlightsBlock({ items, edit }: { items: any[]; edit?: EditBag }) {
  const list = items || [];
  if (!list.length && !edit) return null;
  return (
    <section className={cls("hl", edit)} aria-label="ไฮไลต์ประชาสัมพันธ์" onClick={editRoot(edit).onClick}>
      <div className="hl-wrap">
        <div className="hl-track" style={{ overflowX: "auto", scrollSnapType: "x mandatory" }}>
          {list.length === 0 && edit && <div className="muted" style={{ padding: 16 }}>No banners for this tenant yet.</div>}
          {list.map((bn, i) => {
            const img = mediaUrl(bn.image);
            return (
              <a key={i} className={"hl-slide n" + ((i % 5) + 1)} href={bn.url || "#"} aria-label={bn.label || ""} style={{ scrollSnapAlign: "start" }}>
                {img && <img src={img} alt="" loading="lazy" />}
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatRowBlock({ b, edit, customIcons }: { b: any; edit?: EditBag; customIcons?: Record<string, CustomIconDef> }) {
  const items: any[] = Array.isArray(b.items) ? b.items : [];
  if (!items.length && !edit) return null;
  return (
    <section className={cls("stats-band", edit)} aria-label="สถิติการให้บริการ" onClick={editRoot(edit).onClick}>
      <div className="wrap">
        {items.map((s, i) => (
          <div className={"stat-item" + (edit ? " pvb-arritem" : "")} key={i}>
            <span className="ic pvb-iconwrap" aria-hidden="true">
              <AnyIcon id={s.icon || "users"} customIcons={customIcons} builtinPrefix="i-" size="lg" />
              {edit && <EditableIconPicker edit={edit} path={["items", i, "icon"]} value={s.icon || "users"} kind="stat" customIcons={customIcons} />}
            </span>
            <div className="stat-body">
              <b className="stat-num"><EditableText edit={edit} path={["items", i, "value"]} value={s.value || ""} placeholder="Value" /></b>
              <span className="stat-label"><EditableText edit={edit} path={["items", i, "label"]} value={s.label || ""} placeholder="Label" /></span>
            </div>
            {edit && <button type="button" className="pvb-arr-rm" onClick={(e) => { e.stopPropagation(); edit.onArrayRemove(["items"], i); }} title="Remove item">×</button>}
          </div>
        ))}
      </div>
      {edit && <button type="button" className="pvb-arr-add" onClick={(e) => { e.stopPropagation(); edit.onArrayAdd(["items"], { icon: "users", value: "0", label: "Label" }); }}>+ Add item</button>}
    </section>
  );
}

function VideoChannelBlock({ b, edit, items }: { b: any; edit?: EditBag; items: any[] }) {
  const list = items || [];
  if (!list.length && !edit) return null;
  return (
    <section className={cls("channel", edit)} aria-labelledby="pgb-ch-h" onClick={editRoot(edit).onClick}>
      <div className="channel-inner">
        <h2 id="pgb-ch-h" className="channel-title"><EditableText edit={edit} path={["title"]} value={b.title || "DGA Channel"} placeholder="DGA Channel" /></h2>
        <div className="ch-grid">
          {list.length === 0 && edit && <div className="muted" style={{ padding: 16 }}>No videos for this tenant yet.</div>}
          {list.map((v, i) => {
            const img = mediaUrl(v.thumbnail);
            const href = mediaUrl(v.videoFile) || v.videoUrl || "#";
            return (
              <article className="ch-card" key={v.documentId || i}>
                <a className="ch-thumb" href={href} target={mediaUrl(v.videoFile) ? "_blank" : undefined} rel={mediaUrl(v.videoFile) ? "noreferrer" : undefined}>
                  {img && <img src={img} alt="" loading="lazy" />}
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

function AwardsBlock({ b, edit, items }: { b: any; edit?: EditBag; items: any[] }) {
  const list = items || [];
  if (!list.length && !edit) return null;
  return (
    <section className={cls("auditorium", edit)} aria-labelledby="pgb-aud-h" onClick={editRoot(edit).onClick}>
      <div className="aud-inner">
        <div className="aud-head">
          <span className="aud-eyebrow"><EditableText edit={edit} path={["eyebrow"]} value={b.eyebrow || "ความภาคภูมิใจของเรา"} placeholder="Eyebrow" /></span>
          <h2 id="pgb-aud-h" className="aud-title"><EditableText edit={edit} path={["title"]} value={b.title || "DGA Auditorium"} placeholder="Title" /></h2>
          <p className="aud-sub"><EditableText edit={edit} path={["subtitle"]} value={b.subtitle || "รางวัลและการยอมรับระดับชาติ ที่ตอกย้ำความเป็นผู้นำด้านรัฐบาลดิจิทัลของประเทศไทย"} placeholder="Subtitle" /></p>
        </div>
        <div className="awards">
          {list.length === 0 && edit && <div className="muted" style={{ padding: 16 }}>No awards for this tenant yet.</div>}
          {list.map((w, i) => {
            const img = mediaUrl(w.image);
            return (
              <article className="award" key={w.documentId || i}>
                <div className="award-stage">
                  <span className="award-spot" aria-hidden="true" />
                  {img ? (
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

// Testimonials/logo-cloud/team-grid — same "admin-authored items array" kind
// of block as FeatureGridBlock above (not live-data), so they get the SAME
// full real-canvas editability: EditableText per field, EditableImage per
// item image, onArrayAdd/onArrayRemove for the item list itself.
function TestimonialsBlock({ b, edit }: { b: any; edit?: EditBag }) {
  const items: any[] = Array.isArray(b.items) ? b.items : [];
  if (!items.length && !edit) return null;
  return (
    <section className={cls("block tm-block", edit)} onClick={editRoot(edit).onClick}>
      {(b.heading || edit) && <h2 className="tm-heading"><EditableText edit={edit} path={["heading"]} value={b.heading || ""} placeholder="Section title" /></h2>}
      <div className="tm-grid">
        {items.map((it, i) => (
          <figure className={"tm-card" + (edit ? " pvb-arritem" : "")} key={i}>
            <blockquote className="tm-quote"><EditableText edit={edit} path={["items", i, "quote"]} value={it.quote || ""} placeholder="Quote…" /></blockquote>
            <figcaption className="tm-author">
              <EditableImage edit={edit} path={["items", i, "avatar"]} src={mediaUrl(it.avatar)} alt="" className="tm-avatar" style={{ width: 40, height: 40, borderRadius: "50%" }} />
              <div>
                <b className="tm-name"><EditableText edit={edit} path={["items", i, "author"]} value={it.author || ""} placeholder="Author" /></b>
                <span className="tm-role"><EditableText edit={edit} path={["items", i, "role"]} value={it.role || ""} placeholder="Role" /></span>
              </div>
            </figcaption>
            {edit && <button type="button" className="pvb-arr-rm" onClick={(e) => { e.stopPropagation(); edit.onArrayRemove(["items"], i); }} title="Remove item">×</button>}
          </figure>
        ))}
      </div>
      {edit && <button type="button" className="pvb-arr-add" onClick={(e) => { e.stopPropagation(); edit.onArrayAdd(["items"], { quote: "", author: "", role: "" }); }}>+ Add item</button>}
    </section>
  );
}

function LogoCloudBlock({ b, edit }: { b: any; edit?: EditBag }) {
  const items: any[] = Array.isArray(b.items) ? b.items : [];
  if (!items.length && !edit) return null;
  return (
    <section className={cls("block lc-block", edit)} onClick={editRoot(edit).onClick}>
      {(b.heading || edit) && <h2 className="lc-heading"><EditableText edit={edit} path={["heading"]} value={b.heading || ""} placeholder="Section title" /></h2>}
      <div className="lc-row">
        {items.map((it, i) => (
          <span className={"lc-item" + (edit ? " pvb-arritem" : "")} key={i}>
            <EditableImage edit={edit} path={["items", i, "logo"]} src={mediaUrl(it.logo)} alt={it.name || ""} className="lc-img" style={{ height: 36, width: "auto" }} />
            {edit && <EditableText edit={edit} path={["items", i, "name"]} value={it.name || ""} placeholder="Name" />}
            {edit && <button type="button" className="pvb-arr-rm" onClick={(e) => { e.stopPropagation(); edit.onArrayRemove(["items"], i); }} title="Remove item">×</button>}
          </span>
        ))}
      </div>
      {edit && <button type="button" className="pvb-arr-add" onClick={(e) => { e.stopPropagation(); edit.onArrayAdd(["items"], { name: "", url: "" }); }}>+ Add item</button>}
    </section>
  );
}

function TeamGridBlock({ b, edit }: { b: any; edit?: EditBag }) {
  const items: any[] = Array.isArray(b.items) ? b.items : [];
  if (!items.length && !edit) return null;
  return (
    <section className={cls("block tg-block", edit)} onClick={editRoot(edit).onClick}>
      {(b.heading || edit) && <h2 className="tg-heading"><EditableText edit={edit} path={["heading"]} value={b.heading || ""} placeholder="Section title" /></h2>}
      <div className="tg-grid">
        {items.map((it, i) => (
          <article className={"tg-card" + (edit ? " pvb-arritem" : "")} key={i}>
            <EditableImage edit={edit} path={["items", i, "photo"]} src={mediaUrl(it.photo)} alt="" className="tg-photo" style={{ width: "100%", aspectRatio: "1" }} />
            <b className="tg-name"><EditableText edit={edit} path={["items", i, "name"]} value={it.name || ""} placeholder="Name" /></b>
            <span className="tg-role"><EditableText edit={edit} path={["items", i, "role"]} value={it.role || ""} placeholder="Role" /></span>
            {(it.bio || edit) && <p className="tg-bio"><EditableText edit={edit} path={["items", i, "bio"]} value={it.bio || ""} placeholder="Bio (optional)" /></p>}
            {edit && <button type="button" className="pvb-arr-rm" onClick={(e) => { e.stopPropagation(); edit.onArrayRemove(["items"], i); }} title="Remove item">×</button>}
          </article>
        ))}
      </div>
      {edit && <button type="button" className="pvb-arr-add" onClick={(e) => { e.stopPropagation(); edit.onArrayAdd(["items"], { name: "", role: "" }); }}>+ Add item</button>}
    </section>
  );
}

function BlockquoteBlock({ b, edit }: { b: any; edit?: EditBag }) {
  if (!b.quote && !edit) return null;
  return (
    <section className={cls("block bq-block", edit)} onClick={editRoot(edit).onClick}>
      <blockquote className="bq-quote"><EditableText edit={edit} path={["quote"]} value={b.quote || ""} placeholder="Quote…" /></blockquote>
      {(b.attribution || edit) && <cite className="bq-attribution"><EditableText edit={edit} path={["attribution"]} value={b.attribution || ""} placeholder="Attribution (optional)" /></cite>}
    </section>
  );
}

// No editable fields at all (style/size are sidebar-only enums) — just a
// selectable, labeled placeholder so it's findable/clickable on the canvas.
function SpacerBlock({ b, edit }: { b: any; edit?: EditBag }) {
  const size = b.size === "sm" || b.size === "lg" ? b.size : "md";
  if (b.style === "line") return <hr className={cls("spc-line spc-" + size, edit)} onClick={editRoot(edit).onClick} />;
  return (
    <div className={cls("spc-space spc-" + size, edit)} onClick={editRoot(edit).onClick} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      {edit && <span className="muted" style={{ fontSize: 11 }}>Spacer</span>}
    </div>
  );
}

// Tabs/accordion — `title` is inline-editable (EditableText), `body` is
// click-to-select only (matches RichTextBlock's own precedent above: no
// block anywhere gets inline WYSIWYG richtext editing in this preview,
// only via the sidebar's <RichText>). Tab-switching/accordion-toggling
// stays interactive here too, so the preview behaves like the real page.
function TabsAccordionBlock({ b, edit }: { b: any; edit?: EditBag }) {
  const items: any[] = Array.isArray(b.items) ? b.items : [];
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(0);
  if (!items.length && !edit) return null;
  const isAccordion = b.layout === "accordion";
  return (
    <section className={cls("block tb-block", edit)} onClick={editRoot(edit).onClick}>
      {(b.heading || edit) && <h2 className="tb-heading"><EditableText edit={edit} path={["heading"]} value={b.heading || ""} placeholder="Section title" /></h2>}
      {isAccordion ? (
        <div className="tb-accordion">
          {items.map((it, i) => {
            const expanded = open === i;
            return (
              <div className="tb-acc-item" key={i}>
                <h3 className="tb-acc-q">
                  <button type="button" className="tb-acc-btn" aria-expanded={expanded} onClick={(e) => { e.stopPropagation(); setOpen(expanded ? null : i); }}>
                    <span><EditableText edit={edit} path={["items", i, "title"]} value={it.title || ""} placeholder="Tab title" /></span>
                    <span className="tb-acc-ic" aria-hidden="true" />
                  </button>
                </h3>
                <div className="tb-acc-a" hidden={!expanded}><div dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(it.body) }} /></div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tb-tabs">
          <div className="tb-tablist" role="tablist">
            {items.map((it, i) => (
              <button key={i} type="button" role="tab" className={"tb-tab" + (active === i ? " is-active" : "")} onClick={(e) => { e.stopPropagation(); setActive(i); }}>
                <EditableText edit={edit} path={["items", i, "title"]} value={it.title || ""} placeholder="Tab title" />
              </button>
            ))}
          </div>
          {items.map((it, i) => (
            <div key={i} role="tabpanel" className="tb-panel" hidden={active !== i} dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(it.body) }} />
          ))}
        </div>
      )}
    </section>
  );
}

// Comparison/pricing — same "admin-authored items array" pattern as
// FeatureGridBlock. `features` is a plain string[] (like FeaturedPromoBlock's
// own checklist), edited inline the same way.
function ComparisonBlock({ b, edit }: { b: any; edit?: EditBag }) {
  const columns: any[] = Array.isArray(b.columns) ? b.columns : [];
  if (!columns.length && !edit) return null;
  return (
    <section className={cls("block cmp-block", edit)} onClick={editRoot(edit).onClick}>
      {(b.heading || edit) && <h2 className="cmp-heading"><EditableText edit={edit} path={["heading"]} value={b.heading || ""} placeholder="Section title" /></h2>}
      <div className="cmp-grid">
        {columns.map((c, i) => {
          const features: string[] = Array.isArray(c.features) ? c.features : [];
          return (
            <article className={"cmp-col" + (c.highlight ? " cmp-col--highlight" : "")} key={i}>
              {c.highlight && <span className="cmp-badge">แนะนำ</span>}
              <h3 className="cmp-name"><EditableText edit={edit} path={["columns", i, "name"]} value={c.name || ""} placeholder="Option name" /></h3>
              {(c.price || edit) && <div className="cmp-price"><EditableText edit={edit} path={["columns", i, "price"]} value={c.price || ""} placeholder="Price (optional)" /></div>}
              {(c.description || edit) && <p className="cmp-desc"><EditableText edit={edit} path={["columns", i, "description"]} value={c.description || ""} placeholder="Description" /></p>}
              {(features.length > 0 || edit) && (
                <ul className="cmp-features">
                  {features.map((f, k) => <li key={k}>• <EditableText edit={edit} path={["columns", i, "features", k]} value={f || ""} placeholder="Feature" /></li>)}
                </ul>
              )}
              {(c.ctaLabel || edit) && <span className={"btn " + (c.highlight ? "btn--primary" : "btn--ghost")}><EditableText edit={edit} path={["columns", i, "ctaLabel"]} value={c.ctaLabel || ""} placeholder="Button label" /></span>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Kept in sync by hand with public-site/components/blocks/BlockRenderer.tsx's
// own CollectionListBlock — wrap-only diff per this file's convention: root
// gets cls()/editRoot(), `heading` becomes EditableText, card-plucking logic
// copied verbatim. No per-card editability (matches AwardsBlock's own
// click-select-only precedent for live-data card lists) — the content-type/
// field-mapping config stays sidebar-only.
// Kept in sync with public-site/lib/cms.ts's own SLUGGED_PLURALS — this
// preview-only copy never resolves to a real detail page anyway (Visual
// Builder has no [collection]/[entry] route), it's only used so the href
// shown here matches what the real site will produce.
const SLUGGED_PLURALS = new Set(["articles", "blogs"]);

const LocationMapPreview = dynamic(() => import("./LocationMapPreview"), { ssr: false, loading: () => <div className="cl-map cl-map--loading" /> });

function CollectionListBlock({ b, edit, items, tenant }: { b: any; edit?: EditBag; items: any[]; tenant: string }) {
  if (!items.length && !edit) return null;
  const isMap = b.layout === "map" && b.contentTypeUid === "api::location.location";
  return (
    <section className={cls("block cl-block", edit)} aria-label={b.heading || ""} onClick={editRoot(edit).onClick}>
      {(b.heading || edit) && <h2 className="cl-heading"><EditableText edit={edit} path={["heading"]} value={b.heading || ""} placeholder="Section title" /></h2>}
      {isMap ? (
        <div className="cl-map"><LocationMapPreview entries={items} /></div>
      ) : (
      <div className="cl-grid">
        {items.length === 0 && edit && <div className="muted" style={{ padding: 16 }}>{b.contentTypeUid ? "No entries for this tenant yet." : "Pick a content type in the sidebar."}</div>}
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
      )}
    </section>
  );
}

// Preview-only twin of public-site/components/blocks/FormBlock.tsx — same
// field list/labels (via the hand-duplicated FORM_FIELD_DEFS registry) so
// the layout looks accurate, but EVERY input renders disabled and nothing
// is wired to a real fetch: previewing a page must never write a real
// complaint/application/contact-message/registration row. Click-to-select
// only (no per-field inline editing), matching EmbedBlock/AwardsBlock.
function FormBlock({ b, edit }: { b: any; edit?: EditBag }) {
  const def = FORM_FIELD_DEFS[b.contentTypeUid];
  const mode = b.mode === "track" && def?.hasTracking ? "track" : "submit";
  return (
    <section className={cls("block fb-block", edit)} onClick={editRoot(edit).onClick}>
      {(b.heading || edit) && <h2 className="fb-heading"><EditableText edit={edit} path={["heading"]} value={b.heading || ""} placeholder="Form heading" /></h2>}
      {!def ? (
        <p className="muted">Pick a form type in the sidebar.</p>
      ) : mode === "track" ? (
        <div className="fb-grid">
          <div className="field field--wide"><label>Reference number</label><input className="input" disabled placeholder="DGA-XXX-YYYY-NNNNNN" /></div>
          <button className="btn btn--primary" type="button" disabled>Track</button>
        </div>
      ) : (
        <>
          <div className="fb-grid">
            {def.fields.map((f) => (
              <div className={"field" + (f.kind === "textarea" || f.kind === "select" || f.kind === "file" ? " field--wide" : "")} key={f.key}>
                <label>{f.label}{f.required ? " *" : ""}</label>
                {f.kind === "textarea" ? <textarea className="textarea" disabled />
                  : f.kind === "select" ? <select className="select" disabled><option>{f.options?.[0]?.label}</option></select>
                  : f.kind === "file" ? <input className="input" type="file" disabled />
                  : <input className="input" disabled placeholder={f.label} />}
              </div>
            ))}
          </div>
          <label className="fb-consent"><input type="checkbox" disabled /> {b.consentText || ""}</label>
          <button className="btn btn--primary" type="button" disabled>{b.submitLabel || "Submit"}</button>
        </>
      )}
      <p className="fb-note">Preview only — submissions are disabled while editing.</p>
    </section>
  );
}

function FeaturedPromoBlock({ b, edit }: { b: any; edit?: EditBag }) {
  return (
    <section className={cls("featured", edit)} aria-labelledby="pgb-feat-h" onClick={editRoot(edit).onClick}>
      <div className="panel">
        <div>
          <span className="eyebrow" style={{ color: "var(--c-primary)", fontWeight: 700, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <EditableText edit={edit} path={["eyebrow"]} value={b.eyebrow || ""} placeholder="EYEBROW" />
          </span>
          <h2 id="pgb-feat-h"><EditableText edit={edit} path={["title"]} value={b.title || ""} placeholder="Heading" /></h2>
          <p><EditableText edit={edit} path={["description"]} value={b.description || ""} placeholder="Description…" /></p>
          {!!(Array.isArray(b.items) && b.items.length) && (
            <ul className="feat-list">
              {b.items.map((li: string, i: number) => (
                <li key={i} className={edit ? "pvb-arritem" : undefined}>
                  <span className="ck" aria-hidden="true"><Icon id="i-check" /></span>
                  <EditableText edit={edit} path={["items", i]} value={li} placeholder="Checklist item" />
                  {edit && <button type="button" className="pvb-arr-rm" onClick={(e) => { e.stopPropagation(); edit.onArrayRemove(["items"], i); }} title="Remove item">×</button>}
                </li>
              ))}
            </ul>
          )}
          {edit && <button type="button" className="pvb-arr-add" onClick={(e) => { e.stopPropagation(); edit.onArrayAdd(["items"], "Checklist item"); }}>+ Add checklist item</button>}
          <div className="demo-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
            <a className="btn btn--primary" href={b.primaryUrl || "#"}><EditableText edit={edit} path={["primaryLabel"]} value={b.primaryLabel || ""} placeholder="Primary label" /> <Icon id="i-arrow" /></a>
            {(b.secondaryLabel || edit) && <a className="btn btn--ghost" href={b.secondaryUrl || "#"}><EditableText edit={edit} path={["secondaryLabel"]} value={b.secondaryLabel || ""} placeholder="Secondary label" /></a>}
          </div>
        </div>
        {(mediaUrl(b.image) || edit) && (
          <div className="art">
            <EditableImage edit={edit} path={["image"]} src={mediaUrl(b.image)} alt={b.title || ""} style={{ width: "100%", height: "100%" }} />
          </div>
        )}
      </div>
    </section>
  );
}

// Kept in sync by hand with public-site/components/blocks/EmbedBlock.tsx —
// same duplication convention as every other block here, and same script-
// re-creation technique (see that file's comment for why a plain
// dangerouslySetInnerHTML div would silently never run a <script> tag).
// Click-to-select only, like RichTextBlock/CustomBlock — raw code has no
// discrete DOM node per "field" to attach inline editing to.
function EmbedBlock({ b, edit }: { b: any; edit?: EditBag }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = b.html || "";
    el.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
  }, [b.html]);
  if (!b.html && !edit) return null;
  return <div ref={ref} className={cls("block block--embed", edit)} onClick={editRoot(edit).onClick} />;
}

function CustomBlock({ b, edit, types }: { b: any; edit?: EditBag; types: Record<string, BlockTypeDef> }) {
  const bt = types[b.typeKey];
  if (!bt) return null;
  return <div className={cls("block", edit)} onClick={editRoot(edit).onClick} dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(interpolate(bt, b.props || {})) }} />;
}

function NewsCard({ a, feature }: { a: any; feature?: boolean }) {
  const img = mediaUrl(a.coverImage);
  return (
    <article className={"news-card" + (feature ? " news-card--feature" : "")}>
      <a className="news-thumb" href="#">
        {img ? <img src={img} alt="" loading="lazy" /> : <span className="ph n3"><Icon id="i-doc" /></span>}
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

// Click-to-select only — newsTabLabel/articleTabLabel live inside the tab
// <button>s themselves (they switch tabs on click); putting a contentEditable
// inline-text field inside a clickable tab button is a genuinely awkward,
// conflicting interaction, not just an unported convenience. Framing text
// stays sidebar-edited, same trim as richtext/custom/embed.
function NewsPanelBlock({ articles, newsTabLabel, articleTabLabel, edit }: { articles: any[]; newsTabLabel?: string; articleTabLabel?: string; edit?: EditBag }) {
  const list = articles || [];
  const news = list.filter((a) => a.kind === "news");
  const arts = list.filter((a) => a.kind === "article");
  const [tab, setTab] = useState<"news" | "article">("news");
  const order = (l: any[]) => l.slice().sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  if (!list.length && !edit) return null;

  return (
    <section className={cls("block", edit)} id="news" aria-labelledby="pgb-news-h" onClick={editRoot(edit).onClick}>
      <h2 id="pgb-news-h" className="visually-hidden">ข่าวและบทความ</h2>
      <div className="news-toolbar">
        <div className="news-tabs" role="tablist" aria-label="หมวดข่าว">
          <button className="news-tab" role="tab" aria-selected={tab === "news"} onClick={(e) => { e.stopPropagation(); setTab("news"); }}>{newsTabLabel || "DGA News"}</button>
          {arts.length > 0 && (
            <button className="news-tab" role="tab" aria-selected={tab === "article"} onClick={(e) => { e.stopPropagation(); setTab("article"); }}>{articleTabLabel || "บทความ"}</button>
          )}
        </div>
      </div>
      <div className="news-panel" role="tabpanel">
        <div className="news-items">
          {list.length === 0 && edit && <div className="muted" style={{ padding: 16 }}>No articles for this tenant yet.</div>}
          {order(tab === "news" ? news : arts).map((a, i) => (
            <NewsCard key={a.documentId || i} a={a} feature={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqBlock({ faqs, eyebrow, title, edit }: { faqs: any[]; eyebrow?: string; title?: string; edit?: EditBag }) {
  const items = faqs || [];
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length && !edit) return null;

  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer || "" } })),
  };

  return (
    <section className={cls("block faq", edit)} aria-labelledby="pgb-faq-h" onClick={editRoot(edit).onClick}>
      <div className="wrap">
        <div className="faq__head">
          <span className="eyebrow"><EditableText edit={edit} path={["eyebrow"]} value={eyebrow || "ถาม–ตอบ"} placeholder="Eyebrow" /></span>
          <h2 id="pgb-faq-h"><EditableText edit={edit} path={["title"]} value={title || "คำถามที่พบบ่อย"} placeholder="Title" /></h2>
        </div>
        <div className="faq-list">
          {items.length === 0 && edit && <div className="muted" style={{ padding: 16 }}>No FAQs for this tenant yet.</div>}
          {items.map((f, i) => {
            const qid = "pgb-faq-q" + (i + 1), aid = "pgb-faq-a" + (i + 1);
            const expanded = open === i;
            return (
              <div className="faq-item" key={f.documentId || i}>
                <h3 className="faq-q">
                  <button type="button" className="faq-btn" aria-expanded={expanded} aria-controls={aid} id={qid} onClick={(e) => { e.stopPropagation(); setOpen(expanded ? null : i); }}>
                    <span>{f.question}</span><span className="faq-ic" aria-hidden="true" />
                  </button>
                </h3>
                <div className="faq-a" id={aid} role="region" aria-labelledby={qid} hidden={!expanded}>
                  <div><p>{f.answer || ""}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!edit && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />}
    </section>
  );
}

export default function PreviewBlocks({
  blocks, homeData, customTypes, customIcons, collectionData, tenant,
  active, onSelect, onFieldChange, onImagePick, onArrayAdd, onArrayRemove,
}: {
  blocks: any[]; homeData?: any; customTypes?: Record<string, BlockTypeDef>; customIcons?: Record<string, CustomIconDef>;
  collectionData?: Record<number, any[]>;
  tenant?: string;
  active?: number;
  onSelect?: (i: number) => void;
  onFieldChange?: (i: number, path: Path, value: any) => void;
  onImagePick?: (i: number, path: Path, file: File) => void;
  onArrayAdd?: (i: number, path: Path, item: any) => void;
  onArrayRemove?: (i: number, path: Path, k: number) => void;
}) {
  const list = Array.isArray(blocks) ? blocks : [];
  const hd = homeData || {};
  const types = customTypes || {};
  if (!list.length && onSelect) {
    return (
      <div className="pvb-empty">
        <b>This page has no blocks yet</b>
        <span>Add one from the palette on the left to get started.</span>
      </div>
    );
  }
  return (
    <>
      {list.map((b, i) => {
        // WebX Agent (Phase 8) — agentDraft rides the same EditBag every
        // block already threads to cls()/editRoot() for its root className
        // (see those two helpers in blocks.tsx), so a block just applied
        // from an agent proposal (VisualBuilder.tsx's applyAgentProposal
        // marks it __agent) gets .pvb-agent-draft on its real root element
        // without any individual block component needing to know about it.
        // Only set while edit is present (onSelect passed) — matches
        // .pvb-sel's own existing edit-only precedent; previewMode already
        // strips all such affordances. See RealPreview.tsx's EDITOR_CSS for
        // the matching rule (globals.css never loads inside this iframe).
        const edit: EditBag | undefined = onSelect ? {
          index: i,
          active: active === i,
          onSelect: () => onSelect(i),
          onFieldChange: (path, value) => onFieldChange?.(i, path, value),
          onImagePick: (path, file) => onImagePick?.(i, path, file),
          onArrayAdd: (path, item) => onArrayAdd?.(i, path, item),
          onArrayRemove: (path, k) => onArrayRemove?.(i, path, k),
          agentDraft: !!b.__agent,
        } : undefined;
        switch (b.__component) {
          case "block.hero": return <HeroBlock key={i} b={b} edit={edit} />;
          case "block.richtext": return <RichTextBlock key={i} b={b} edit={edit} />;
          case "block.image": return <ImageBlock key={i} b={b} edit={edit} />;
          case "block.cta-banner": return <CtaBannerBlock key={i} b={b} edit={edit} />;
          case "block.feature-grid": return <FeatureGridBlock key={i} b={b} edit={edit} customIcons={customIcons} />;
          case "block.custom": return <CustomBlock key={i} b={b} edit={edit} types={types} />;
          case "block.highlights": return <HighlightsBlock key={i} items={hd.banners} edit={edit} />;
          case "block.stat-row": return <StatRowBlock key={i} b={b} edit={edit} customIcons={customIcons} />;
          case "block.news-panel": return <NewsPanelBlock key={i} articles={hd.articles} newsTabLabel={b.newsTabLabel} articleTabLabel={b.articleTabLabel} edit={edit} />;
          case "block.video-channel": return <VideoChannelBlock key={i} b={b} edit={edit} items={hd.videos} />;
          case "block.awards": return <AwardsBlock key={i} b={b} edit={edit} items={hd.awards} />;
          case "block.faq": return <FaqBlock key={i} faqs={hd.faqs} eyebrow={b.eyebrow} title={b.title} edit={edit} />;
          case "block.featured-promo": return <FeaturedPromoBlock key={i} b={b} edit={edit} />;
          case "block.embed": return <EmbedBlock key={i} b={b} edit={edit} />;
          case "block.collection-list": return <CollectionListBlock key={i} b={b} edit={edit} items={collectionData?.[i] || []} tenant={tenant || ""} />;
          case "block.form": return <FormBlock key={i} b={b} edit={edit} />;
          case "block.testimonials": return <TestimonialsBlock key={i} b={b} edit={edit} />;
          case "block.logo-cloud": return <LogoCloudBlock key={i} b={b} edit={edit} />;
          case "block.team-grid": return <TeamGridBlock key={i} b={b} edit={edit} />;
          case "block.blockquote": return <BlockquoteBlock key={i} b={b} edit={edit} />;
          case "block.spacer": return <SpacerBlock key={i} b={b} edit={edit} />;
          case "block.tabs": return <TabsAccordionBlock key={i} b={b} edit={edit} />;
          case "block.comparison": return <ComparisonBlock key={i} b={b} edit={edit} />;
          default: return null;
        }
      })}
    </>
  );
}
