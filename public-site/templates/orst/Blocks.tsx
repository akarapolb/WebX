import { Fragment, type ReactNode } from "react";
import FaqAccordion from "./FaqAccordion";

/* =============================================================================
   Blocks.tsx — React port of the ORST static site's block renderer
   -----------------------------------------------------------------------------
   Ported 1:1 from (source folder, see task):
     assets/js/blocks.js        — renderBlocks(blocks) + per-type render fns
     content/blocks.schema.json — field shapes for each block type
     assets/css/blocks.css      — class names every block must use verbatim

   Cross-checked against dist/about.html and dist/publications.html (the real
   pre-rendered output) for exact DOM structure/class names wherever blocks.js's
   string-building code was ambiguous.

   Every block type is a server-rendered function component here; the only
   interactive piece (the faq accordion open/close) is split out into the
   client component FaqAccordion.tsx so the rest of this file stays server-only.
   ============================================================================= */

export type Block = {
  type: string;
  id?: string;
  variant?: string;
  heading?: string;
  lead?: string;
  eyebrow?: string;
  action?: { label: string; href: string };
  [key: string]: any;
};

/* ---------- shared helpers ---------- */

/** Icon from the sprite (see components/IconSprite.tsx) — verbatim port of
    blocks.js's `icon(id, className)`. Kept local (rather than reusing the
    existing <Icon/> helper) because blocks.js uses single literal classes
    like "icon-lg" straight from blocks.css, not the "icon icon--lg" scheme
    IconSprite's <Icon/> uses. Icon ids referenced by ORST content (i-file,
    i-map, i-phone, i-dictionary, i-journal, i-database, i-video, i-puzzle,
    i-megaphone, i-service, i-people, i-chevron, ...) mostly don't exist yet
    in IconSprite.tsx's sprite — a separate task adds the missing <symbol>s. */
function BlockIcon({ id, className = "icon" }: { id?: string; className?: string }) {
  if (!id) return null;
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** Standard section head: heading + lead + top-right action link. */
function SectionHead({ block }: { block: Block }) {
  if (!block.heading && !block.lead) return null;
  return (
    <div className="section-head">
      <div>
        {block.eyebrow ? <span className="block-eyebrow">{block.eyebrow}</span> : null}
        {block.heading ? <h2>{block.heading}</h2> : null}
        {block.lead ? <p>{block.lead}</p> : null}
      </div>
      {block.action?.href ? (
        <a className="view-all" href={block.action.href}>
          {block.action.label || "ดูทั้งหมด"}
        </a>
      ) : null}
    </div>
  );
}

/** Wraps block content in <section class="section[ alt][ extraClass]"><div class="container">. */
function Section({
  block,
  extraClass = "",
  children,
}: {
  block: Block;
  extraClass?: string;
  children: ReactNode;
}) {
  const cls = ["section", block.variant === "alt" ? "alt" : "", extraClass].filter(Boolean).join(" ");
  return (
    <section className={cls} id={block.id}>
      <div className="container">
        <SectionHead block={block} />
        {children}
      </div>
    </section>
  );
}

type ActionItem = { label?: string; href?: string; variant?: string };

/** A row of buttons/links. */
function Actions({ list }: { list?: ActionItem[] }) {
  if (!list?.length) return null;
  return (
    <div className="block-actions">
      {list.map((a, i) => (
        <a key={i} className={a.variant === "ghost" ? "block-btn is-ghost" : "block-btn"} href={a.href || "#"}>
          {a.label || ""}
        </a>
      ))}
    </div>
  );
}

/** Column-count class for grids. */
function colsClass(n?: number) {
  const c = Number(n) || 3;
  return `block-grid block-grid-${Math.min(Math.max(c, 1), 4)}`;
}

/* ---------- Block: page-hero ---------- */

function PageHero({ b }: { b: Block }) {
  const crumbs: { label: string; href?: string }[] = b.breadcrumb || [];
  return (
    <section className="page-hero" id={b.id}>
      <div className="container">
        {crumbs.length ? (
          <nav className="block-breadcrumb" aria-label="เส้นทางหน้า">
            {crumbs.map((c, i) =>
              i === crumbs.length - 1 ? (
                <span key={i} aria-current="page">
                  {c.label}
                </span>
              ) : (
                <Fragment key={i}>
                  <a href={c.href || "#"}>{c.label}</a>
                  <span aria-hidden="true">/</span>
                </Fragment>
              )
            )}
          </nav>
        ) : null}
        {b.eyebrow ? <span className="block-eyebrow">{b.eyebrow}</span> : null}
        <h1>{b.heading}</h1>
        {b.lead ? <p>{b.lead}</p> : null}
        <Actions list={b.actions} />
      </div>
    </section>
  );
}

/* ---------- Block: rich-text ---------- */

function RichText({ b }: { b: Block }) {
  const cls = "block-prose" + (b.width === "full" ? "" : " block-prose-narrow");
  if (b.html) {
    return (
      <Section block={b}>
        <div className={cls} dangerouslySetInnerHTML={{ __html: b.html }} />
      </Section>
    );
  }
  const paragraphs: string[] = b.paragraphs || [];
  return (
    <Section block={b}>
      <div className={cls}>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </Section>
  );
}

/* ---------- Block: card-grid ---------- */

function CardGrid({ b }: { b: Block }) {
  const items: any[] = b.items || [];
  return (
    <Section block={b}>
      <div className={colsClass(b.columns)}>
        {items.map((it, i) => {
          const inner = (
            <>
              {it.icon ? (
                <span className="block-card-icon">
                  <BlockIcon id={it.icon} className="icon-lg" />
                </span>
              ) : null}
              {it.tag ? <span className="block-tag">{it.tag}</span> : null}
              <h3>{it.title}</h3>
              {it.body ? <p>{it.body}</p> : null}
              {it.meta ? <small className="block-meta">{it.meta}</small> : null}
            </>
          );
          return it.href ? (
            <a key={i} className="content-card block-card is-link" href={it.href}>
              {inner}
            </a>
          ) : (
            <article key={i} className="content-card block-card">
              {inner}
            </article>
          );
        })}
      </div>
    </Section>
  );
}

/* ---------- Block: feature-list ---------- */

function FeatureList({ b }: { b: Block }) {
  const items: any[] = b.items || [];
  return (
    <Section block={b}>
      <ul className={colsClass(b.columns) + " block-feature-list"}>
        {items.map((it, i) => (
          <li className="block-feature" key={i}>
            <span className="block-feature-icon">
              <BlockIcon id={it.icon || "i-shield"} className="icon-lg" />
            </span>
            <div>
              <strong>{it.title}</strong>
              {it.body ? <p>{it.body}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- Block: stat-row ---------- */

function StatRow({ b }: { b: Block }) {
  const items: any[] = b.items || [];
  return (
    <Section block={b}>
      <div className="block-stat-row">
        {items.map((it, i) => (
          <div className="block-stat" key={i}>
            <strong>{it.value}</strong>
            <span>{it.label}</span>
            {it.note ? <small>{it.note}</small> : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------- Block: link-list ---------- */

function LinkList({ b }: { b: Block }) {
  const items: any[] = b.items || [];
  return (
    <Section block={b}>
      <ul className="block-link-list">
        {items.map((it, i) => (
          <li key={i}>
            <a className="block-link-row" href={it.href || "#"}>
              <span className="block-link-icon">
                <BlockIcon id={it.icon || "i-file"} />
              </span>
              <span className="block-link-text">
                <strong>{it.title}</strong>
                {it.desc ? <span>{it.desc}</span> : null}
              </span>
              {it.tag ? <span className="block-tag">{it.tag}</span> : null}
              {it.meta ? <span className="block-meta">{it.meta}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- Block: media-grid ---------- */

function MediaGrid({ b }: { b: Block }) {
  const items: any[] = b.items || [];
  return (
    <Section block={b}>
      <div className={colsClass(b.columns)}>
        {items.map((it, i) => {
          const inner = (
            <>
              <span className="block-media-thumb">
                <img src={it.image} alt={it.alt || it.title || ""} loading="lazy" />
                {it.tag ? <span className="block-tag">{it.tag}</span> : null}
              </span>
              <span className="block-media-body">
                <strong>{it.title}</strong>
                {it.desc ? <span>{it.desc}</span> : null}
              </span>
            </>
          );
          return it.href ? (
            <a key={i} className="block-media-card is-link" href={it.href}>
              {inner}
            </a>
          ) : (
            <div key={i} className="block-media-card">
              {inner}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/* ---------- Block: table ---------- */

function TableBlock({ b }: { b: Block }) {
  const columns: string[] = b.columns || [];
  const rows: string[][] = b.rows || [];
  return (
    <Section block={b}>
      <div className="block-table-wrap">
        <table className="block-table">
          {b.caption ? <caption>{b.caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th scope="col" key={i}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) =>
                    ci === 0 ? (
                      <th scope="row" key={ci}>
                        {cell}
                      </th>
                    ) : (
                      <td key={ci}>{cell}</td>
                    )
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length || 1} className="block-table-empty">
                  ยังไม่มีกำหนดการในขณะนี้ โปรดติดตามข่าวสารเพิ่มเติม
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ---------- Block: faq ---------- */

function Faq({ b }: { b: Block }) {
  const items: { q: string; a: string }[] = b.items || [];
  return (
    <Section block={b}>
      <FaqAccordion id={b.id} items={items} />
    </Section>
  );
}

/* ---------- Block: steps ---------- */

function Steps({ b }: { b: Block }) {
  const items: any[] = b.items || [];
  return (
    <Section block={b}>
      <ol className="block-steps">
        {items.map((it, i) => (
          <li className="block-step" key={i}>
            <span className="block-step-no" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <strong>{it.title}</strong>
              {it.body ? <p>{it.body}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ---------- Block: two-column ---------- */

function TwoColumn({ b }: { b: Block }) {
  const side = b.imageSide === "left" ? " is-image-left" : "";
  const paragraphs: string[] = b.paragraphs || [];
  return (
    <Section block={b}>
      <div className={"block-two-col" + side}>
        <div className="block-two-col-text">
          {b.subheading ? <h3>{b.subheading}</h3> : null}
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <Actions list={b.actions} />
        </div>
        <div className="block-two-col-media">
          <img src={b.image} alt={b.imageAlt || ""} loading="lazy" />
        </div>
      </div>
    </Section>
  );
}

/* ---------- Block: cta-band ---------- */

function CtaBand({ b }: { b: Block }) {
  return (
    <section className="block-cta" id={b.id}>
      <div className="container block-cta-inner">
        <div>
          <h2>{b.heading}</h2>
          {b.body ? <p>{b.body}</p> : null}
        </div>
        <Actions list={b.actions} />
      </div>
    </section>
  );
}

/* ---------- Block: notice ---------- */

const NOTICE_ICONS: Record<string, string> = { info: "i-file", warn: "i-shield", success: "i-shield" };

function Notice({ b }: { b: Block }) {
  const tone = ["info", "warn", "success"].includes(b.tone) ? b.tone : "info";
  return (
    <Section block={b}>
      <div className={"block-notice is-" + tone} role="note">
        <span className="block-notice-icon">
          <BlockIcon id={NOTICE_ICONS[tone]} className="icon-lg" />
        </span>
        <div>
          {b.title ? <strong>{b.title}</strong> : null}
          <p>{b.body}</p>
        </div>
      </div>
    </Section>
  );
}

/* ---------- Block: contact-info ---------- */

function ContactRow({ iconId, label, value, href }: { iconId: string; label: string; value?: string; href?: string }) {
  if (!value) return null;
  return (
    <li className="block-contact-row">
      <span className="block-contact-icon">
        <BlockIcon id={iconId} />
      </span>
      <div>
        <small>{label}</small>
        {href ? <a href={href}>{value}</a> : <span>{value}</span>}
      </div>
    </li>
  );
}

function ContactInfo({ b }: { b: Block }) {
  return (
    <Section block={b}>
      <div className={"block-contact" + (b.mapEmbed ? " has-map" : "")}>
        <ul className="block-contact-list">
          <ContactRow iconId="i-map" label="ที่อยู่" value={b.address} />
          <ContactRow
            iconId="i-phone"
            label="โทรศัพท์"
            value={b.phone}
            href={b.phone ? `tel:${String(b.phone).replace(/[^0-9+]/g, "")}` : undefined}
          />
          <ContactRow iconId="i-file" label="อีเมล" value={b.email} href={b.email ? `mailto:${b.email}` : undefined} />
          <ContactRow iconId="i-eye" label="เวลาทำการ" value={b.hours} />
        </ul>
        {b.mapEmbed ? (
          <div className="block-contact-map">
            <iframe src={b.mapEmbed} title="แผนที่" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/* ---------- registry ---------- */

const BLOCKS: Record<string, (b: Block) => ReactNode> = {
  "page-hero": (b) => <PageHero b={b} />,
  "rich-text": (b) => <RichText b={b} />,
  "card-grid": (b) => <CardGrid b={b} />,
  "feature-list": (b) => <FeatureList b={b} />,
  "stat-row": (b) => <StatRow b={b} />,
  "link-list": (b) => <LinkList b={b} />,
  "media-grid": (b) => <MediaGrid b={b} />,
  table: (b) => <TableBlock b={b} />,
  faq: (b) => <Faq b={b} />,
  steps: (b) => <Steps b={b} />,
  "two-column": (b) => <TwoColumn b={b} />,
  "cta-band": (b) => <CtaBand b={b} />,
  notice: (b) => <Notice b={b} />,
  "contact-info": (b) => <ContactInfo b={b} />,
};

const BLOCK_TYPES = Object.keys(BLOCKS);

/** Fallback markup for an unknown block type or one that fails to render —
    mirrors blocks.js's renderBlocks() try/catch fallback exactly. */
function UnknownBlock({ label, detail }: { label: string; detail: string }) {
  return (
    <section className="section">
      <div className="container">
        <div className="block-notice is-warn" role="note">
          <div>
            <strong>{label}</strong>
            <p>{detail}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {(blocks || []).map((block, index) => {
        const key = block?.id || index;
        const render = block?.type ? BLOCKS[block.type] : undefined;

        if (!render) {
          return (
            <Fragment key={key}>
              <UnknownBlock
                label={`ไม่รู้จัก block ชนิด "${block?.type}" (ลำดับที่ ${index + 1})`}
                detail={`ชนิดที่ใช้ได้: ${BLOCK_TYPES.join(", ")}`}
              />
            </Fragment>
          );
        }

        try {
          return <Fragment key={key}>{render(block)}</Fragment>;
        } catch (error: any) {
          return (
            <Fragment key={key}>
              <UnknownBlock
                label={`สร้าง block "${block.type}" (ลำดับที่ ${index + 1}) ไม่สำเร็จ`}
                detail={error?.message || String(error)}
              />
            </Fragment>
          );
        }
      })}
    </>
  );
}
