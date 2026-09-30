import { Fragment, type ReactNode } from "react";
import { sanitizeCmsHtml } from "@/lib/sanitize";
import FaqAccordion from "./FaqAccordion";
import ContactFormBlock from "./ContactFormBlock";
import PollBlock from "./PollBlock";
import { MediaTabs, NewsEventsTabs, ScrollButton } from "./HomeInteractive";
import EventCalendar from "@/components/EventCalendar";
import MemberDirectory from "@/components/MemberDirectory";
import ListExport from "@/components/ListExport";
import Picture from "@/components/Picture";
import JobApplicationForm from "@/components/JobApplicationForm";
import type { JobPosting } from "@/lib/cms";
import { vc, boxesCss } from "@/templates/_builder/boxes";
import { stylesCss } from "@/templates/_builder/styles";
import { resolveIcons, type IconLibrary } from "@/templates/_builder/resolveIcons";
import { sanitizeIconSvg, safeViewBox } from "@/lib/iconSvg";

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
// An icon is either a sprite symbol id ("i-shield") or, once resolveIcons()
// below has matched it against the tenant's own icon library, the resolved
// definition for a custom one. Call sites pass `it.icon` straight through and
// never need to know which they have.
type IconValue = string | { svg?: string; viewBox?: string; imageUrl?: string };

function BlockIcon({ id, className = "icon" }: { id?: IconValue; className?: string }) {
  if (!id) return null;
  if (typeof id === "object") {
    // Re-sanitised here rather than trusted from storage: an Icon record can
    // be edited through Strapi directly, so whatever the editor saved proves
    // nothing about what is in the database now.
    const safe = sanitizeIconSvg(id.svg);
    if (safe) {
      return (
        <svg className={className} viewBox={safeViewBox(id.viewBox)} aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: safe }} />
      );
    }
    if (id.imageUrl) return <img className={className} src={id.imageUrl} alt="" style={{ objectFit: "contain" }} />;
    return null;
  }
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
    <div className="section-head reveal">
      <div>
        {block.eyebrow ? <span className="block-eyebrow" {...vc(block, "eyebrow")}>{block.eyebrow}</span> : null}
        {block.heading ? <h2 {...vc(block, "heading")}>{block.heading}</h2> : null}
        {block.lead ? <p {...vc(block, "lead")}>{block.lead}</p> : null}
      </div>
      {block.action?.href ? (
        <a className="view-all" href={block.action.href} {...vc(block, "action")}>
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
function Actions({ list, b, k = "actions" }: { list?: ActionItem[]; b?: Block; k?: string }) {
  if (!list?.length) return null;
  return (
    <div className="block-actions" {...vc(b, k)}>
      {list.map((a, i) => (
        <a key={i} className={a.variant === "ghost" ? "block-btn is-ghost" : "block-btn"} href={a.href || "#"} {...vc(b, k + "." + i)}>
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
          <nav className="block-breadcrumb" aria-label="เส้นทางหน้า" {...vc(b, "breadcrumb")}>
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
        {b.eyebrow ? <span className="block-eyebrow" {...vc(b, "eyebrow")}>{b.eyebrow}</span> : null}
        <h1 {...vc(b, "heading")}>{b.heading}</h1>
        {b.lead ? <p {...vc(b, "lead")}>{b.lead}</p> : null}
        <Actions list={b.actions} b={b} />
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
        <div className={cls} dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(b.html) }} />
      </Section>
    );
  }
  const paragraphs: string[] = b.paragraphs || [];
  return (
    <Section block={b}>
      <div className={cls} {...vc(b, "paragraphs")}>
        {paragraphs.map((p, i) => (
          <p key={i} {...vc(b, "paragraphs." + i)}>{p}</p>
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
      <div className={colsClass(b.columns) + " reveal"} {...vc(b, "items")}>
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
            <a key={i} className="content-card block-card is-link" href={it.href} {...vc(b, "items." + i)}>
              {inner}
            </a>
          ) : (
            <article key={i} className="content-card block-card" {...vc(b, "items." + i)}>
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
      <ul className={colsClass(b.columns) + " block-feature-list"} {...vc(b, "items")}>
        {items.map((it, i) => (
          <li className="block-feature" key={i} {...vc(b, "items." + i)}>
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
      <div className="block-stat-row" {...vc(b, "items")}>
        {items.map((it, i) => (
          <div className="block-stat" key={i} {...vc(b, "items." + i)}>
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
      <ul className="block-link-list" {...vc(b, "items")}>
        {items.map((it, i) => (
          <li key={i} {...vc(b, "items." + i)}>
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
      <div className={colsClass(b.columns)} {...vc(b, "items")}>
        {items.map((it, i) => {
          const inner = (
            <>
              <span className="block-media-thumb">
                <Picture src={it.image} alt={it.alt || it.title || ""} loading="lazy" />
                {it.tag ? <span className="block-tag">{it.tag}</span> : null}
              </span>
              <span className="block-media-body">
                <strong>{it.title}</strong>
                {it.desc ? <span>{it.desc}</span> : null}
              </span>
            </>
          );
          return it.href ? (
            <a key={i} className="block-media-card is-link" href={it.href} {...vc(b, "items." + i)}>
              {inner}
            </a>
          ) : (
            <div key={i} className="block-media-card" {...vc(b, "items." + i)}>
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
      <ListExport title={b.heading || "รายการ"} columns={columns} rows={rows} />
      <div className="block-table-wrap" {...vc(b, "rows")}>
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
      <div {...vc(b, "items")}>
        <FaqAccordion id={b.id} items={items} />
      </div>
    </Section>
  );
}

/* ---------- Block: steps ---------- */

function Steps({ b }: { b: Block }) {
  const items: any[] = b.items || [];
  return (
    <Section block={b}>
      <ol className="block-steps" {...vc(b, "items")}>
        {items.map((it, i) => (
          <li className="block-step" key={i} {...vc(b, "items." + i)}>
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
          {b.subheading ? <h3 {...vc(b, "subheading")}>{b.subheading}</h3> : null}
          {paragraphs.map((p, i) => (
            <p key={i} {...vc(b, "paragraphs." + i)}>{p}</p>
          ))}
          <Actions list={b.actions} b={b} />
        </div>
        <div className="block-two-col-media" {...vc(b, "image")}>
          <Picture src={b.image} alt={b.imageAlt || ""} loading="lazy" />
        </div>
      </div>
    </Section>
  );
}

/* ---------- Block: cta-band ---------- */

function CtaBand({ b }: { b: Block }) {
  return (
    <section className="block-cta" id={b.id}>
      {/* The one ornamental moment on the page. A closing band is where a
          printed institutional document would carry a device, so it's where
          the kranok-derived hairline earns its place — see .orst-ornament in
          blocks.css for why this is a single restrained mark and not a
          repeating pattern fill. */}
      <span className="orst-ornament" aria-hidden="true" />
      <div className="container block-cta-inner">
        <div>
          <h2 {...vc(b, "heading")}>{b.heading}</h2>
          {b.body ? <p {...vc(b, "body")}>{b.body}</p> : null}
        </div>
        <Actions list={b.actions} b={b} />
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
      <div className={"block-notice is-" + tone} role="note" {...vc(b, "notice")}>
        <span className="block-notice-icon">
          <BlockIcon id={NOTICE_ICONS[tone]} className="icon-lg" />
        </span>
        <div>
          {b.title ? <strong {...vc(b, "title")}>{b.title}</strong> : null}
          <p {...vc(b, "body")}>{b.body}</p>
        </div>
      </div>
    </Section>
  );
}

/* ---------- Block: event-calendar ---------- */
// Real "ปฏิทินกิจกรรม" — see components/EventCalendar.tsx's own file
// comment. news.json's "calendar" block used to be an always-empty
// `table` (rows: []); this is that same block id, now backed by real
// wp:event data via `source: {kind:"wp", postType:"event", map:"calendar"}`.
function EventCalendarBlock({ b }: { b: Block }) {
  return (
    <Section block={b}>
      <div {...vc(b, "items")}>
        <EventCalendar items={b.items || []} icsHref="/orst/events.ics" />
      </div>
    </Section>
  );
}

/* ---------- Block: member-directory ---------- */
// Real member/scholar directory — see components/MemberDirectory.tsx's own
// file comment. Fills in the "at-a-glance" block's previously-placeholder
// "[จำนวน] ราชบัณฑิตและภาคีสมาชิก" count (app/orst/[page]/page.tsx derives
// it from this same wp:member data) and gives that count somewhere real to
// point to.
function MemberDirectoryBlock({ b, locale }: { b: Block; locale?: "th" | "en" }) {
  return (
    <Section block={b}>
      <div {...vc(b, "items")}>
        <MemberDirectory items={b.items || []} locale={locale} />
      </div>
    </Section>
  );
}

/* ---------- Block: job-listing ---------- */
// Real job/application e-forms (TOR gap audit — see components/
// JobApplicationForm.tsx's own file comment). `b.jobs` is a bespoke
// server-side merge (app/orst/[page]/page.tsx's "careers" branch), same
// pattern as the about page's "at-a-glance"/member-directory data — jobs
// come from Strapi's api::job.job (a cross-tenant-engine type, like
// tenant/menu-item), not from WordPress.
function JobListingBlock({ b, tenant }: { b: Block; tenant: string }) {
  const jobs: JobPosting[] = b.jobs || [];
  return (
    <Section block={b}>
      {jobs.length === 0 ? (
        <p className="muted">{b.emptyLabel || "ขณะนี้ยังไม่มีตำแหน่งงานว่าง"}</p>
      ) : (
        <>
          <div className="wx-job-list" {...vc(b, "jobs")}>
            {jobs.map((j) => (
              <article className="wx-job-card content-card" key={j.jobId}>
                <h3>{j.title}</h3>
                <div className="wx-job-meta">
                  {j.dept ? <span>{j.dept}</span> : null}
                  {j.location ? <span>{j.location}</span> : null}
                  {j.type ? <span>{j.type}</span> : null}
                </div>
                {j.summary ? <p>{j.summary}</p> : null}
                <div className="wx-job-meta">
                  {j.salary ? <span><b>อัตราค่าตอบแทน:</b> {j.salary}</span> : null}
                  {j.deadline ? <span><b>รับสมัครถึง:</b> {j.deadline}</span> : null}
                </div>
              </article>
            ))}
          </div>
          <div style={{ marginTop: 32 }} {...vc(b, "form")}>
            {b.formHeading ? <h3 {...vc(b, "formHeading")}>{b.formHeading}</h3> : null}
            <JobApplicationForm tenant={tenant} jobs={jobs} />
          </div>
        </>
      )}
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

// Bilingual EN (TOR gap) — these row labels + the map iframe title used to
// be hardcoded Thai regardless of locale, even though the VALUES next to
// them (b.address/b.phone/etc) already come from real per-locale tenant data.
const CONTACT_LABELS = {
  th: { address: "ที่อยู่", phone: "โทรศัพท์", email: "อีเมล", hours: "เวลาทำการ", map: "แผนที่" },
  en: { address: "Address", phone: "Phone", email: "Email", hours: "Hours", map: "Map" },
} as const;
function ContactInfo({ b, locale = "th" }: { b: Block; locale?: "th" | "en" }) {
  const l = CONTACT_LABELS[locale];
  return (
    <Section block={b}>
      <div className={"block-contact" + (b.mapEmbed ? " has-map" : "")}>
        <ul className="block-contact-list" {...vc(b, "contact")}>
          <ContactRow iconId="i-map" label={l.address} value={b.address} />
          <ContactRow
            iconId="i-phone"
            label={l.phone}
            value={b.phone}
            href={b.phone ? `tel:${String(b.phone).replace(/[^0-9+]/g, "")}` : undefined}
          />
          <ContactRow iconId="i-file" label={l.email} value={b.email} href={b.email ? `mailto:${b.email}` : undefined} />
          <ContactRow iconId="i-eye" label={l.hours} value={b.hours} />
        </ul>
        {b.mapEmbed ? (
          <div className="block-contact-map" {...vc(b, "mapEmbed")}>
            <iframe src={b.mapEmbed} title={l.map} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/* ---------- Block: contact-hero ---------- */
// Ported from ContactPage.tsx's own <section className="contact-hero">
// (that page's decomposition into blocks — see app/orst/[page]/page.tsx and
// the Phase "full decomposition" plan) — a hero WITH a summary info card
// alongside it, which page-hero (no such card) doesn't model. Kept as its
// own type rather than overloading page-hero with optional card fields,
// since no other ORST page needs this shape.

function ContactHero({ b }: { b: Block }) {
  const telHref = b.phone ? "tel:" + String(b.phone).replace(/[^0-9]/g, "") : undefined;
  return (
    <section className="contact-hero" aria-labelledby="page-title">
      <div className="container contact-hero-inner">
        <div>
          {b.eyebrow ? <span className="eyebrow" {...vc(b, "eyebrow")}>{b.eyebrow}</span> : null}
          <h1 id="page-title" {...vc(b, "heading")}>{b.heading}</h1>
          {b.lead ? <p {...vc(b, "lead")}>{b.lead}</p> : null}
          <div className="hero-actions" {...vc(b, "actions")}>
            {b.cta1Label ? (
              <a className="btn" href={b.cta1Url || "#"} {...vc(b, "cta1Label")}>
                <BlockIcon id="i-send" className="icon" />{" "}{b.cta1Label}
              </a>
            ) : null}
            {b.cta2Label ? (
              <a className="btn secondary" href={b.cta2Url || "#"} {...vc(b, "cta2Label")}>
                <BlockIcon id="i-map" className="icon" />{" "}{b.cta2Label}
              </a>
            ) : null}
          </div>
        </div>

        <aside className="hero-info-card" aria-label="ข้อมูลติดต่อโดยสรุป" {...vc(b, "infoCard")}>
          <h2>ข้อมูลติดต่อสำคัญ</h2>
          {b.officeHours ? (
            <div className="office-status">
              <span></span> {b.officeHours}
            </div>
          ) : null}
          <div className="hero-info-list">
            {b.phone ? (
              <a href={telHref}>
                <BlockIcon id="i-phone" />
                <span>{b.phone}<small>ฝ่ายสอบถาม</small></span>
              </a>
            ) : null}
            {b.email ? (
              <a href={"mailto:" + b.email}>
                <BlockIcon id="i-mail" />
                <span>{b.email}<small>อีเมลกลางสำหรับติดต่อสำนักงาน</small></span>
              </a>
            ) : null}
            {b.address ? (
              <div>
                <BlockIcon id="i-map" />
                <span>{b.address}<small>ที่ตั้งสำนักงาน</small></span>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

/* ---------- Block: stats-hero ---------- */
// Ported from KnowledgePage.tsx's own <section className="knowledge-hero">
// during its full decomposition into blocks (see app/orst/[page]/page.tsx).
// The source page's hero search box and quick-query chips were dropped
// entirely, not just left inert — they were decorative-only (no real
// search behind them, confirmed by that page's own file header comment)
// and the user's own call, when asked, was to simplify to real content
// rather than preserve non-functional UI. What's kept (eyebrow/heading/
// lead + a stat-list aside + a note) is genuine, editable content.
function StatsHero({ b }: { b: Block }) {
  const stats: { label: string; value: string }[] = b.stats || [];
  return (
    <section className="knowledge-hero" aria-labelledby="page-title">
      <div className="container hero-inner">
        <div className="hero-copy">
          {b.eyebrow ? <span className="eyebrow" {...vc(b, "eyebrow")}>{b.eyebrow}</span> : null}
          <h1 id="page-title" {...vc(b, "heading")}>{b.heading}</h1>
          {b.lead ? <p {...vc(b, "lead")}>{b.lead}</p> : null}
        </div>
        {stats.length ? (
          <aside className="hero-panel" aria-label={b.panelLabel || "ภาพรวม"} {...vc(b, "panel")}>
            {b.panelHeading ? <h2 {...vc(b, "panelHeading")}>{b.panelHeading}</h2> : null}
            <div className="stat-list" {...vc(b, "stats")}>
              {stats.map((s, i) => (
                <div className="stat-row" key={i} {...vc(b, "stats." + i)}>
                  <span>{s.label}</span>
                  <strong>{s.value}</strong>
                </div>
              ))}
            </div>
            {b.note ? <div className="hero-note" {...vc(b, "note")}>{b.note}</div> : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}

/* ---------- Block: home-hero ---------- */
// Ported from HomePage.tsx's own <section className="hero hero-reference
// orst-hero-wow"> during its full decomposition into blocks (see
// app/orst/[page]/page.tsx). A third, distinct hero style from page-hero
// (no breadcrumb/actions) and contact-hero (no info card) — this one owns
// its own CSS namespace (orst-hero-*) in home.css. The source's "Smart
// Search" box and popular-query chips were mocked (no real search behind
// them, confirmed by the file's own header comment) and were dropped
// entirely rather than ported inert, same call already made for
// KnowledgePage's hero.
// Photograph-led hero. The four hero0N images have been sitting in
// public/assets/orst/images/ (and converted to WebP) since the Core Web
// Vitals pass without a single call site — this is the first thing that
// actually renders one. hero03 is the default specifically because its left
// third is an empty wall: real negative space for the text block to sit in,
// rather than type dropped on top of a busy subject. `image` is a block
// field so an editor can swap it (hero01/02/04 are the same shoot) without
// a code change.
//
// The photo is decorative — the headline carries the meaning — so it gets
// alt="" and is hidden from the a11y tree unless the block supplies its own
// imageAlt, which would make it a content image worth announcing.
function HomeHero({ b }: { b: Block }) {
  const image = b.image || "/assets/orst/images/hero03.png";
  const alt = b.imageAlt || "";
  return (
    <section className="hero hero-reference orst-hero-wow" aria-labelledby="hero-title">
      <div className="orst-hero-media" aria-hidden={alt ? undefined : "true"}>
        <Picture src={image} alt={alt} className="orst-hero-photo" fetchPriority="high" decoding="async" />
        <span className="orst-hero-scrim" />
      </div>
      <div className="container orst-hero-wrap">
        <div className="orst-hero-content">
          {b.eyebrow ? <span className="orst-hero-kicker" {...vc(b, "eyebrow")}>{b.eyebrow}</span> : null}
          <h1 id="hero-title" className="orst-hero-title" {...vc(b, "heading")}>{b.heading}</h1>
          {b.lead ? <p className="orst-hero-lead" {...vc(b, "lead")}>{b.lead}</p> : null}
          <Actions list={b.actions} b={b} />
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: media-tabs ---------- */
// Ported from HomePage.tsx's "Knowledge Hub" section (id="publications").
// Reuses MediaTabs/ScrollButton from HomeInteractive.tsx UNCHANGED — those
// take pre-rendered panel JSX (not a function), so this stays a plain
// (non-client) component: the tab-switching STATE lives inside MediaTabs'
// own "use client" boundary, this just constructs the tabs array.
// Each tab has a `kind` ("pub" | "media") selecting which of the source's
// two card/row markup variants to use — the multimedia tab genuinely uses
// different classes (.media-card/.media-row) than ebook/journals/
// encyclopedia (.pub-card/.publication-row), not just different content.
// Deep tab/item content is edited as JSON via the Content screen, not a
// bespoke nested sidebar UI — same scope line as the table block's
// columns/rows (see ORST_TYPES's own comment there).
type MediaTabItem = { image?: string; tag?: string; title?: string; caption: string };
function MediaTabItemCard({ it, kind }: { it: MediaTabItem; kind: string }) {
  if (kind === "media") {
    return (
      <article className="media-card hub-tile">
        <div className="media-thumb has-photo">
          {it.image ? <Picture src={it.image} alt={it.caption} loading="lazy" /> : null}
        </div>
        <p>{it.caption}</p>
      </article>
    );
  }
  if (it.image) {
    return (
      <article className="pub-card hub-tile">
        <div className="cover cover-image">
          <Picture src={it.image} alt={it.caption} loading="lazy" />
        </div>
        <p>{it.caption}</p>
      </article>
    );
  }
  return (
    <article className="pub-card hub-tile text-card">
      <div className="knowledge-text-cover">
        {it.tag ? <span>{it.tag}</span> : null}
        {it.title ? <strong>{it.title}</strong> : null}
      </div>
      <p>{it.caption}</p>
    </article>
  );
}
function MediaTabsBlock({ b }: { b: Block }) {
  const tabs: any[] = b.tabs || [];
  return (
    <section className="section knowledge-hub-section" id={b.id}>
      <div className="container">
        <div className="section-head knowledge-hub-head">
          <div>
            {b.eyebrow ? <span className="section-kicker" {...vc(b, "eyebrow")}>{b.eyebrow}</span> : null}
            {b.heading ? <h2 {...vc(b, "heading")}>{b.heading}</h2> : null}
            {b.lead ? <p {...vc(b, "lead")}>{b.lead}</p> : null}
          </div>
          {b.viewAllLabel ? <a className="view-all media-view-all-link" href={b.viewAllUrl || "#"} {...vc(b, "viewAllLabel")}>{b.viewAllLabel}</a> : null}
        </div>
        <div {...vc(b, "tabs")}>
        <MediaTabs
          tabs={tabs.map((t) => ({
            id: t.id,
            label: t.label,
            panel: (
              <div className={(t.kind === "media" ? "media-tab-shell" : "publication-shell") + " media-tab-shell"}>
                <ScrollButton rowId={`${t.id}-row`} dir="left" label={`เลื่อน${t.label}ไปทางซ้าย`} />
                <div className={(t.kind === "media" ? "media-row" : "publication-row") + " knowledge-scroll-row"} id={`${t.id}-row`}>
                  {(t.items || []).map((it: MediaTabItem, i: number) => <MediaTabItemCard key={i} it={it} kind={t.kind} />)}
                </div>
                <ScrollButton rowId={`${t.id}-row`} dir="right" label={`เลื่อน${t.label}ไปทางขวา`} />
              </div>
            ),
          }))}
        />
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: news-tabs ---------- */
// Ported from HomePage.tsx's "News & Events" section (id="news"). The
// calendar aside is kept exactly as the source had it — a static June 2567
// example month, not data-driven — building a real calendar-with-real-
// events widget is a genuinely separate feature (a content type, an admin
// UI, real event data), not a block-decomposition concern; see this file's
// own header precedent for "don't build a working system around numbers/
// dates that don't correspond to real data" (KnowledgePage's stats).
type NewsSideItem = { image?: string; type?: string; title: string; body?: string };
type NewsTabDef = {
  id: string; label: string;
  featured: { image?: string; badge?: string; date?: string; category?: string; title: string; body?: string; ctaLabel?: string };
  side?: NewsSideItem[];
};
function NewsEventsCalendar() {
  return (
    <aside className="events-calendar-card" aria-label="ปฏิทินกิจกรรม">
      <div className="calendar-head">
        <div><span className="section-kicker">Calendar</span><h3>ปฏิทินกิจกรรม</h3></div>
        <a href="/orst/news" aria-label="ดูปฏิทินทั้งหมด">ทั้งหมด</a>
      </div>
      <div className="calendar-month">
        <button type="button" aria-label="เดือนก่อนหน้า">‹</button>
        <strong>มิถุนายน 2567</strong>
        <button type="button" aria-label="เดือนถัดไป">›</button>
      </div>
      <div className="calendar-grid" aria-label="ปฏิทินเดือนมิถุนายน 2567">
        <span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span>
        <button type="button" className="muted">26</button><button type="button" className="muted">27</button>
        <button type="button" className="muted">28</button><button type="button" className="muted">29</button>
        <button type="button" className="muted">30</button><button type="button" className="muted">31</button>
        <button type="button">1</button>
        <button type="button">2</button><button type="button">3</button><button type="button">4</button>
        <button type="button">5</button><button type="button">6</button><button type="button">7</button><button type="button">8</button>
        <button type="button">9</button><button type="button">10</button><button type="button">11</button>
        <button type="button">12</button><button type="button">13</button><button type="button">14</button><button type="button">15</button>
        <button type="button">16</button><button type="button">17</button>
        <button type="button" className="has-event" aria-label="18 มิถุนายน 2567 มีอบรม">18</button>
        <button type="button">19</button><button type="button">20</button><button type="button">21</button><button type="button">22</button>
        <button type="button">23</button><button type="button">24</button>
        <button type="button" className="has-event" aria-label="25 มิถุนายน 2567 มีอบรม">25</button>
        <button type="button">26</button><button type="button">27</button><button type="button">28</button><button type="button">29</button>
      </div>
      <div className="calendar-agenda">
        <strong>กำหนดการใกล้ถึง</strong>
        <a href="#" className="agenda-item">
          <span className="agenda-date"><b>18</b><small>มิ.ย.</small></span>
          <span><b>อบรมการใช้ภาษาไทยในงานราชการ</b><small>อบรม · 09.00–12.00 น.</small></span>
        </a>
        <a href="#" className="agenda-item">
          <span className="agenda-date"><b>25</b><small>มิ.ย.</small></span>
          <span><b>อบรมการเขียนเอกสารราชการ</b><small>อบรม · ออนไลน์</small></span>
        </a>
      </div>
    </aside>
  );
}
function NewsTabsBlock({ b }: { b: Block }) {
  const tabs: NewsTabDef[] = b.tabs || [];
  return (
    <section className="section alt news-events-section" id={b.id}>
      <div className="container">
        <div className="section-head news-events-head">
          <div>
            {b.eyebrow ? <span className="section-kicker" {...vc(b, "eyebrow")}>{b.eyebrow}</span> : null}
            {b.heading ? <h2 {...vc(b, "heading")}>{b.heading}</h2> : null}
            {b.lead ? <p {...vc(b, "lead")}>{b.lead}</p> : null}
          </div>
          {b.viewAllLabel ? <a href={b.viewAllUrl || "#"} className="view-all" {...vc(b, "viewAllLabel")}>{b.viewAllLabel}</a> : null}
        </div>
        <div {...vc(b, "tabs")}>
        <NewsEventsTabs
          calendar={<NewsEventsCalendar />}
          tabs={tabs.map((t) => ({
            id: t.id,
            label: t.label,
            panel: (
              <div className="news-mosaic-layout">
                <article className="news-mosaic-feature">
                  {/* TOR gap audit (accessibility/WCAG) — a real Lighthouse
                      audit flagged this link's accessible name (the aria-
                      label) as not matching its own VISIBLE text content
                      (the badge span rendered inside it) — a screen reader
                      announced the article title while a sighted/voice-
                      control user saw only the badge text, a real mismatch.
                      Folding the badge into the label keeps both the visible
                      text and the fuller context. */}
                  <a href="#" className="news-mosaic-feature-img" aria-label={t.featured?.badge ? `${t.featured.badge}: ${t.featured?.title}` : t.featured?.title}>
                    {t.featured?.image ? <Picture src={t.featured.image} alt={t.featured.title} loading="lazy" /> : null}
                    {t.featured?.badge ? <span className="news-type-badge">{t.featured.badge}</span> : null}
                  </a>
                  <div className="news-mosaic-feature-body">
                    <div className="news-meta">
                      {t.featured?.date ? <span>{t.featured.date}</span> : null}
                      {t.featured?.category ? <span>{t.featured.category}</span> : null}
                    </div>
                    <h3>{t.featured?.title}</h3>
                    {t.featured?.body ? <p>{t.featured.body}</p> : null}
                    <a className="news-primary-action" href="#">{t.featured?.ctaLabel || "อ่านต่อ →"}</a>
                  </div>
                </article>
                <div className="news-mosaic-side">
                  {(t.side || []).map((s, i) => (
                    <article className="news-mosaic-card" key={i}>
                      <a href="#" className="news-mosaic-thumb">
                        {s.image ? <Picture src={s.image} alt={s.title} loading="lazy" /> : null}
                      </a>
                      <div className="news-mosaic-card-body">
                        {s.type ? <span className="news-mini-type">{s.type}</span> : null}
                        <h4>{s.title}</h4>
                        {s.body ? <p>{s.body}</p> : null}
                        {/* Bilingual EN (TOR gap) — this used to be a hardcoded
                            "อ่านต่อ →" regardless of locale, since side items
                            have no cta field of their own; reuses the same
                            tab's featured.ctaLabel (already real per-locale
                            copy from content/{en/}news.json) rather than
                            adding a new per-item field just for this. */}
                        <a href="#">{t.featured?.ctaLabel || "อ่านต่อ →"}</a>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ),
          }))}
        />
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: service-hub ---------- */
// Ported from HomePage.tsx's "Digital Service Hub" section. The source's
// per-card icons are hand-drawn inline SVG paths, not sprite ids — rather
// than approximate them with a possibly-wrong sprite icon, cards here are
// text-only (badge/title/body), a minor, deliberate simplification.
function ServiceHub({ b }: { b: Block }) {
  const steps: { label: string }[] = b.steps || [];
  const items: { badge?: string; time?: string; title: string; body?: string; buttonLabel?: string; href?: string }[] = b.items || [];
  // Each region renders only when it has something in it — the Visual
  // Builder lets an editor remove any of these parts, and an empty styled
  // intro panel/head left behind would look like a rendering bug.
  const hasHead = !!(b.eyebrow || b.heading || b.lead || b.viewAllLabel);
  const hasIntro = !!(b.introLabel || b.introHeading || b.introLead || steps.length);
  return (
    <section className="section public-service-section" id={b.id}>
      <div className="container">
        {hasHead ? (
        <div className="service-directory-head">
          <div>
            {b.eyebrow ? <span className="section-kicker" {...vc(b, "eyebrow")}>{b.eyebrow}</span> : null}
            {b.heading ? <h2 {...vc(b, "heading")}>{b.heading}</h2> : null}
            {b.lead ? <p {...vc(b, "lead")}>{b.lead}</p> : null}
          </div>
          {b.viewAllLabel ? <a className="view-all" href={b.viewAllUrl || "#"} {...vc(b, "viewAllLabel")}>{b.viewAllLabel}</a> : null}
        </div>
        ) : null}
        {hasIntro || items.length ? (
        <div className="service-directory" style={hasIntro ? undefined : { gridTemplateColumns: "1fr" }}>
          {/* Without the intro panel, home.css's 300px|1fr desktop grid would
              squeeze the cards into the 300px track — hence the override. */}
          {hasIntro ? (
          <aside className="service-directory-intro" {...vc(b, "intro")}>
            {b.introLabel ? <span className="intro-label" {...vc(b, "introLabel")}>{b.introLabel}</span> : null}
            {b.introHeading ? <h3 {...vc(b, "introHeading")}>{b.introHeading}</h3> : null}
            {b.introLead ? <p {...vc(b, "introLead")}>{b.introLead}</p> : null}
            {steps.length ? (
              <div className="intro-steps" aria-label="ขั้นตอนการใช้บริการ" {...vc(b, "steps")}>
                {steps.map((s, i) => (
                  <div key={i} {...vc(b, "steps." + i)}><span>{String(i + 1).padStart(2, "0")}</span><strong>{s.label}</strong></div>
                ))}
              </div>
            ) : null}
          </aside>
          ) : null}
          {items.length ? (
          <div className="service-directory-list" {...vc(b, "items")}>
            {items.map((it, i) => (
              <article className="public-service-card" key={i} {...vc(b, "items." + i)}>
                <div className="public-service-content">
                  {it.badge || it.time ? (
                  <div className="public-service-top">
                    {it.badge ? <span className="service-badge">{it.badge}</span> : null}
                    {it.time ? <span className="service-time">{it.time}</span> : null}
                  </div>
                  ) : null}
                  {it.title ? <h3>{it.title}</h3> : null}
                  {it.body ? <p>{it.body}</p> : null}
                  {it.buttonLabel ? <a className="service-link-btn" href={it.href || "#contact-form"}>{it.buttonLabel}<span aria-hidden="true">→</span></a> : null}
                </div>
              </article>
            ))}
          </div>
          ) : null}
        </div>
        ) : null}
      </div>
    </section>
  );
}

/* ---------- Block: logo-marquee ---------- */
// Ported from HomePage.tsx's "Connected Network" section. The source
// duplicates its logo list into a second, aria-hidden group so the CSS
// scroll animation loops seamlessly — reproduced here by rendering `items`
// twice rather than storing it duplicated in the block's own data.
function LogoMarquee({ b }: { b: Block }) {
  const items: { name: string; image?: string; href?: string }[] = b.items || [];
  const group = (hidden: boolean) => (
    <div className="network-marquee-group" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <a className="network-logo-item" href={it.href || "#"} key={i} tabIndex={hidden ? -1 : undefined} aria-label={hidden ? undefined : it.name} {...(hidden ? {} : vc(b, "items." + i))}>
          <span className="network-logo">
            {it.image ? <Picture src={it.image} alt={hidden ? "" : it.name} loading="lazy" /> : <BlockIcon id="i-search" className="icon-lg" />}
          </span>
          <strong>{it.name}</strong>
        </a>
      ))}
    </div>
  );
  return (
    <section className="section alt network-section network-section-compact" id={b.id}>
      <div className="container">
        <div className="network-head network-head-compact">
          <div>
            {b.eyebrow ? <span className="section-kicker" {...vc(b, "eyebrow")}>{b.eyebrow}</span> : null}
            {b.heading ? <h2 {...vc(b, "heading")}>{b.heading}</h2> : null}
            {b.lead ? <p {...vc(b, "lead")}>{b.lead}</p> : null}
          </div>
          {b.viewAllLabel ? <a className="view-all" href={b.viewAllUrl || "#"} aria-label={b.viewAllLabel} {...vc(b, "viewAllLabel")}>{b.viewAllLabel}</a> : null}
        </div>
        <div className="network-marquee" aria-label="โลโก้หน่วยงานและระบบที่เกี่ยวข้อง" {...vc(b, "items")}>
          <div className="network-marquee-track">
            {group(false)}
            {group(true)}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: flex-panel ---------- */
// The one "no-code new block" escape hatch — see webx-studio's
// BlockTypeEditor for why an open-ended HTML-template mechanism (the
// gov-portal block.custom pattern) doesn't fit here: it can't reuse this
// template's own CSS classes safely. Instead this is ONE coded block type
// with SIX pre-built layouts, each just reusing an existing block's own
// markup/classes — so an editor can compose a notice, a card grid, a link
// list, a CTA band, a stat row, or a feature strip without a developer
// touching this file again, but can't produce anything visually
// off-catalog. A genuinely new arrangement (not one of these six) still
// needs a real new block type.
function FlexPanel({ b }: { b: Block }) {
  const items: { icon?: string; title?: string; body?: string; href?: string }[] = b.items || [];
  const layout = b.layout || "cards";
  const tone = ["info", "warn", "success"].includes(b.tone) ? b.tone : "info";

  if (layout === "banner") {
    return (
      <Section block={b}>
        <div className={"block-notice is-" + tone} role="note" {...vc(b, "notice")}>
          <span className="block-notice-icon">
            <BlockIcon id={NOTICE_ICONS[tone]} className="icon-lg" />
          </span>
          <div>
            {b.heading ? <strong>{b.heading}</strong> : null}
            {b.lead ? <p>{b.lead}</p> : null}
          </div>
        </div>
      </Section>
    );
  }

  if (layout === "list") {
    return (
      <Section block={b}>
        <ul className="block-link-list" {...vc(b, "items")}>
          {items.map((it, i) => (
            <li key={i} {...vc(b, "items." + i)}>
              <a className="block-link-row" href={it.href || "#"}>
                <span className="block-link-icon">
                  <BlockIcon id={it.icon || "i-file"} />
                </span>
                <span className="block-link-text">
                  <strong>{it.title}</strong>
                  {it.body ? <span>{it.body}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  if (layout === "cta") {
    return (
      <section className="block-cta" id={b.id}>
        <div className="container block-cta-inner">
          <div>
            <h2 {...vc(b, "heading")}>{b.heading}</h2>
            {b.lead ? <p {...vc(b, "lead")}>{b.lead}</p> : null}
          </div>
          {items.length ? (
            <div className="block-actions" {...vc(b, "items")}>
              {items.map((it, i) => (
                <a key={i} className="block-btn" href={it.href || "#"} {...vc(b, "items." + i)}>
                  {it.title}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  if (layout === "stats") {
    return (
      <Section block={b}>
        <div className="block-stat-row" {...vc(b, "items")}>
          {items.map((it, i) => (
            <div className="block-stat" key={i} {...vc(b, "items." + i)}>
              <strong>{it.title}</strong>
              {it.body ? <span>{it.body}</span> : null}
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (layout === "feature") {
    return (
      <Section block={b}>
        <ul className={colsClass(items.length >= 4 ? 4 : 3) + " block-feature-list"} {...vc(b, "items")}>
          {items.map((it, i) => (
            <li className="block-feature" key={i} {...vc(b, "items." + i)}>
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

  // default: cards
  return (
    <Section block={b}>
      <div className={colsClass(items.length >= 4 ? 4 : 3)} {...vc(b, "items")}>
        {items.map((it, i) => {
          const inner = (
            <>
              {it.icon ? (
                <span className="block-card-icon">
                  <BlockIcon id={it.icon} className="icon-lg" />
                </span>
              ) : null}
              <h3>{it.title}</h3>
              {it.body ? <p>{it.body}</p> : null}
            </>
          );
          return it.href ? (
            <a key={i} className="content-card block-card is-link" href={it.href} {...vc(b, "items." + i)}>
              {inner}
            </a>
          ) : (
            <article key={i} className="content-card block-card" {...vc(b, "items." + i)}>
              {inner}
            </article>
          );
        })}
      </div>
    </Section>
  );
}

/* ---------- registry ---------- */

// Bilingual EN (TOR gap) — locale is optional and ignored by every renderer
// except member-directory (the one block whose own chrome, not just its
// data, needs to switch language — see MemberDirectory.tsx). Widening this
// signature is a smaller, safer change than threading a new prop through
// all ~30 renderers individually.
const BLOCKS: Record<string, (b: Block, locale?: "th" | "en") => ReactNode> = {
  "page-hero": (b) => <PageHero b={b} />,
  "stats-hero": (b) => <StatsHero b={b} />,
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
  "contact-info": (b, locale) => <ContactInfo b={b} locale={locale} />,
  "contact-hero": (b) => <ContactHero b={b} />,
  "contact-form": (b) => <ContactFormBlock b={b} />,
  "home-hero": (b) => <HomeHero b={b} />,
  "media-tabs": (b) => <MediaTabsBlock b={b} />,
  "news-tabs": (b) => <NewsTabsBlock b={b} />,
  "service-hub": (b) => <ServiceHub b={b} />,
  "logo-marquee": (b) => <LogoMarquee b={b} />,
  "flex-panel": (b) => <FlexPanel b={b} />,
  "poll": (b) => <PollBlock b={b} />,
  "event-calendar": (b) => <EventCalendarBlock b={b} />,
  "member-directory": (b, locale) => <MemberDirectoryBlock b={b} locale={locale} />,
  "job-listing": (b) => <JobListingBlock b={b} tenant="orst" />,
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

// `indexOffset` — the Builder's preview harness renders one block per call
// (each in its own wrapper), so it passes the block's real page index to keep
// the `data-vb-s` scope (and the per-block CSS below) unique across the page.
export default function Blocks({ blocks, locale, indexOffset = 0, customIcons }: { blocks: Block[]; locale?: "th" | "en"; indexOffset?: number; customIcons?: IconLibrary }) {
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
          // Free-form component moves/resizes saved from the Visual Builder
          // (see templates/_builder/boxes.ts) — keys and numbers are
          // whitelisted/clamped there, so this string is safe to inline.
          const idx = indexOffset + index;
          const css = boxesCss(block, idx) + stylesCss(block, idx);
          return (
            <Fragment key={key}>
              {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
              {/* Icon keys are swapped for the tenant's own definitions once,
                  here, rather than threaded through every block component —
                  see templates/_builder/resolveIcons.ts. */}
              {render(resolveIcons({ ...block, __vbi: idx }, customIcons), locale)}
            </Fragment>
          );
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
