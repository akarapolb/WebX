import { Fragment, type ReactNode } from "react";
import { sanitizeCmsHtml } from "@/lib/sanitize";
import HeroSlider from "./HeroSlider";
import { RsIcon, RS_ICON_IDS, type RsIconId } from "./icons";
import ContactForm from "./ContactInteractive";
import { RsScrollButton } from "./RoyalSocietyInteractive";
import EventCalendar from "@/components/EventCalendar";
import MemberDirectory from "@/components/MemberDirectory";
import ListExport from "@/components/ListExport";
import Picture from "@/components/Picture";
import JobApplicationForm from "@/components/JobApplicationForm";
import type { JobPosting } from "@/lib/cms";

/* =============================================================================
   Blocks.tsx — royalsociety's own block renderer (Visual Builder for
   WordPress tenants, Phase "RoyalSociety parity" — see templates/orst/
   Blocks.tsx for the sibling implementation this mirrors).

   Every class name below is copied verbatim from the pre-decomposition
   HomePage.tsx/AboutPage.tsx/KnowledgePage.tsx/ActivitiesPage.tsx/
   PublicationsPage.tsx/ServicesPage.tsx/ContactPage.tsx (all now deleted —
   nothing else imports them) and from public/assets/royalsociety/css's
   04-components.css + pages/home.css + pages/about.css, which already
   define every one of these classes — no new CSS was written for this pass.

   Same "shared vocabulary, per-template skin" split as ORST: this file's
   block TYPES conceptually mirror several of ORST's (page-hero/card-grid/
   faq/table/notice/cta-band/logo-marquee/contact-info/contact-form), but
   render royalsociety's own `.rs-*`/`.about-*`/`.ks-*`/... classes and its
   own inline-SVG RsIcon set (see icons.tsx — NOT the sprite BlockIcon ORST
   uses, since RS deliberately avoids the global sprite's id collisions).

   Fake/non-functional UI dropped rather than ported inert, same call the
   user made for ORST's KnowledgePage: KnowledgePage/PublicationsPage's
   `.rs-filter` search forms (no onSubmit anywhere in the source) and their
   `.rs-tags` quick-filter chips, ActivitiesPage's `.rs-tags` filter, and the
   monthly-calendar sidebar (a hardcoded, non-data-driven June widget — same
   category as ORST's NewsEventsCalendar, which stayed hardcoded rather than
   becoming a block; here it's dropped instead since nothing else on the page
   needed the sidebar layout it justified).
   ============================================================================= */

export type Block = {
  type: string;
  id?: string;
  variant?: string;
  heading?: string;
  lead?: string;
  eyebrow?: string;
  [key: string]: any;
};

/* ---------- shared helpers ---------- */

function SafeRsIcon({ id, className }: { id?: string; className?: string }) {
  const iconId = (RS_ICON_IDS as readonly string[]).includes(id || "") ? (id as RsIconId) : "i-book";
  return <RsIcon id={iconId} className={className} />;
}

function SectionHead({ b, titleId }: { b: Block; titleId: string }) {
  if (!b.heading && !b.lead && !b.eyebrow) return null;
  return (
    <div className="section-head reveal">
      {b.eyebrow ? <span className="eyebrow">{b.eyebrow}</span> : null}
      {b.heading ? <h2 id={titleId}>{b.heading}</h2> : null}
      {b.lead ? <p>{b.lead}</p> : null}
    </div>
  );
}

/** Wraps content in <section class="section"><div class="container"> — the
 * plain wrapper every one of RS's inner-page sections already used verbatim. */
function Section({ b, children }: { b: Block; children: ReactNode }) {
  const titleId = (b.id || "sec") + "-title";
  return (
    <section className="section" id={b.id} aria-labelledby={b.heading ? titleId : undefined}>
      <div className="container">
        <SectionHead b={b} titleId={titleId} />
        {children}
      </div>
    </section>
  );
}

/* ---------- Block: page-hero ---------- */
// `.page-hero`/`.breadcrumb`/`.page-hero__*` — identical across every inner
// page in the source (Knowledge/Activities/Publications/Services/Contact),
// only the crumb label and `--deep` variant (Services) differ.
function PageHero({ b, locale }: { b: Block; locale?: "th" | "en" }) {
  // Bilingual EN (TOR gap) — this breadcrumb's "Home" crumb used to hardcode
  // both its Thai text AND its href to the Thai homepage regardless of
  // locale, so an English-page visitor clicking it landed back on the Thai
  // site — a real navigation bug, not just a cosmetic one.
  const home = locale === "en" ? { href: "/en/royalsociety", label: "Home", nav: "Breadcrumb" } : { href: "/royalsociety", label: "หน้าหลัก", nav: "เส้นทางนำทาง" };
  return (
    <section className={"page-hero" + (b.variant === "deep" ? " page-hero--deep" : "")} id={b.id}>
      <div className="container page-hero__inner">
        <nav className="breadcrumb" aria-label={home.nav}>
          <a href={home.href}>{home.label}</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{b.heading}</span>
        </nav>
        {b.eyebrow ? <span className="page-hero__kicker">{b.eyebrow}</span> : null}
        <h1 className="page-hero__title">{b.heading}</h1>
        {b.lead ? <p className="page-hero__lead">{b.lead}</p> : null}
      </div>
    </section>
  );
}

/* ---------- Block: about-hero ---------- */
// Ported from AboutPage.tsx's "about-hero-clean" section. `founded`/
// `currentLaw`/`bureauCount` are a bespoke server-side merge (see
// app/royalsociety/[page]/page.tsx), not builder-editable fields — same
// precedent as ORST AboutPage's "at-a-glance" summary (earliest/latest
// timeline year + org-unit count derived from data the timeline/org-structure
// blocks already carry, so it can never drift out of sync with them).
function AboutHero({ b, locale }: { b: Block; locale?: "th" | "en" }) {
  // Bilingual EN (TOR gap) — these 3 fact labels used to be hardcoded Thai
  // regardless of locale, even though the VALUES next to them (b.founded /
  // b.currentLaw / b.bureauCount) already come from a real per-locale merge
  // (see app/{,en/}royalsociety/[page]/page.tsx's "about" branch) — so an
  // English page showed an English value under a Thai label.
  const facts = locale === "en"
    ? { founded: "Established", law: "Current Act", structure: "Academic Structure" }
    : { founded: "สถาปนา", law: "กฎหมายปัจจุบัน", structure: "โครงสร้างวิชาการ" };
  return (
    <section className="about-hero-clean" aria-labelledby="about-hero-title">
      <div className="about-container">
        <div className="about-hero-clean-grid">
          <div className="about-hero-clean-content">
            {b.eyebrow ? <span className="about-hero-label">{b.eyebrow}</span> : null}
            <h1 id="about-hero-title">{b.heading}</h1>
            {b.subtitle ? <p className="about-hero-clean-subtitle">{b.subtitle}</p> : null}
            {b.lead ? <p className="about-hero-clean-desc">{b.lead}</p> : null}
            <div className="about-hero-clean-actions" aria-label="ลิงก์ลัดเกี่ยวกับราชบัณฑิตยสภา">
              {b.action1Label ? <a href={b.action1Href || "#"} className="about-clean-btn primary">{b.action1Label}</a> : null}
              {b.action2Label ? <a href={b.action2Href || "#"} className="about-clean-btn secondary">{b.action2Label}</a> : null}
            </div>
          </div>
          {b.image ? (
            <aside className="about-hero-clean-visual" aria-label="ภาพประกอบราชบัณฑิตยสภา">
              <Picture src={b.image} alt="" loading="eager" />
            </aside>
          ) : null}
        </div>

        <dl className="about-hero-clean-facts" aria-label="ข้อมูลสำคัญโดยสรุป">
          <div><dt>{facts.founded}</dt><dd>{b.founded || "—"}</dd></div>
          <div><dt>{facts.law}</dt><dd>{b.currentLaw || "—"}</dd></div>
          <div><dt>{facts.structure}</dt><dd>{b.bureauCount || "—"}</dd></div>
        </dl>
      </div>
    </section>
  );
}

/* ---------- Block: home-hero ---------- */
// Ported from HomePage.tsx's "#home-hero" section. The background slideshow
// (HeroSlider + its 4 source images) stays a fixed constant, same scope line
// ORST drew around decorative, non-content media (its own home-hero's
// gradient background, media-tabs'/news-tabs' deep tab content) — not
// exposed as an editable field in this pass.
const HERO_SLIDES = [
  "/assets/royalsociety/images/BG-01.jpg",
  "/assets/royalsociety/images/BG-02.jpg",
  "/assets/royalsociety/images/BG-03.jpg",
  "/assets/royalsociety/images/BG-04.jpg",
];
function HomeHero({ b }: { b: Block }) {
  return (
    <section className="rs-hero rs-hero-institution" id={b.id || "home-hero"} aria-label="ภาพนำราชบัณฑิตยสภา">
      <HeroSlider slides={HERO_SLIDES} />
      <div className="rs-hero__shade"></div>
      <div className="container rs-hero__inner">
        <div className="rs-hero__content reveal">
          {b.eyebrow ? <span className="rs-hero__kicker">{b.eyebrow}</span> : null}
          <h1 className="rs-hero-title"><span>{b.heading}</span></h1>
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: trust-strip ---------- */

function TrustStrip({ b }: { b: Block }) {
  const items: { icon?: string; title: string }[] = b.items || [];
  return (
    <section className="trust-strip" aria-label={b.eyebrow || "คุณค่าหลักของเว็บไซต์"} id={b.id}>
      <div className="container trust-grid">
        {items.map((it, i) => (
          <article className="trust-item" key={i}>
            <SafeRsIcon id={it.icon} className="icon trust-icon" />
            {/* TOR gap audit (accessibility/WCAG) — was <h3>, but this
                section has no <h2> of its own for it to nest under, so the
                page's heading order skipped straight from the hero's <h1>
                to <h3> (caught by a real Lighthouse audit). Promoted to
                <h2>, matching NewsFeed's own <h2> immediately after this
                section on the same page. */}
            <div><h2>{it.title}</h2></div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- Block: news-feed ---------- */
// Ported from HomePage.tsx's "latest-updates-section" — the first item
// renders as the large `.latest-main-news` feature, the rest as
// `.latest-small-news-grid` cards. Per-card thumbnails cycle through 3 stock
// images (source had no image field on its news items either), same
// documented behavior HomePage.tsx already had before decomposition.
const NEWS_IMAGES = [
  "/assets/royalsociety/images/new-01.jpg",
  "/assets/royalsociety/images/new-02.jpg",
  "/assets/royalsociety/images/new-03.jpg",
];
function NewsFeed({ b }: { b: Block }) {
  const items: { date?: string; title: string; body?: string; href?: string }[] = b.items || [];
  const [featured, ...rest] = items;
  const titleId = (b.id || "news") + "-title";
  return (
    <section className="latest-updates-section section latest-news-only-section" id={b.id} aria-labelledby={titleId}>
      <div className="container">
        <div className="latest-news-only-head reveal">
          <div>
            {b.eyebrow ? <span className="section-kicker">{b.eyebrow}</span> : null}
            {b.heading ? <h2 id={titleId}>{b.heading}</h2> : null}
            {b.lead ? <p>{b.lead}</p> : null}
          </div>
          {b.viewAllLabel ? <a className="latest-view-all" href={b.viewAllUrl || "#"}>{b.viewAllLabel}<span>→</span></a> : null}
        </div>

        <div className="latest-news-only-layout reveal">
          {featured ? (
            <article className="latest-main-news">
              <a href={featured.href || "#"} className="latest-main-news__image">
                <Picture src={NEWS_IMAGES[0]} alt="" loading="lazy" />
                {/* Bilingual EN (TOR gap) — badgeLabel/readMoreLabel are new
                    optional block-level fields (read straight off `b`, no
                    per-item field or locale plumbing needed); this used to
                    be a hardcoded Thai literal regardless of locale. */}
                <span className="latest-main-news__badge">{b.badgeLabel || "ข่าวล่าสุด"}</span>
              </a>
              <div className="latest-main-news__body">
                <div className="latest-meta"><time dateTime={featured.date}>{featured.date}</time></div>
                <h3><a href={featured.href || "#"}>{featured.title}</a></h3>
                {featured.body ? <p>{featured.body}</p> : null}
                <div style={{ textAlign: "end" }}>
                  <a className="latest-main-news__link is-compact" href={featured.href || "#"}>{b.readMoreLabel || "อ่านต่อ"}<span>→</span></a>
                </div>
              </div>
            </article>
          ) : null}

          <div className="latest-small-news-grid">
            {rest.map((a, i) => (
              <article className="latest-small-news" key={i}>
                {/* TOR gap audit (accessibility/WCAG) — a real Lighthouse
                    audit flagged this link as focusable with literally no
                    accessible name (a decorative image with alt="" and no
                    other content) — a keyboard/screen-reader user tabbing
                    through the page would land on an unannounced mystery
                    link. The adjacent h3 link below already reaches the
                    same destination with the real title as its text, so
                    the fix is to remove this purely-visual duplicate from
                    the accessibility tree entirely (aria-hidden + no tab
                    stop) rather than repeat the same title as a redundant
                    second announcement. */}
                <a href={a.href || "#"} className="latest-small-news__image" aria-hidden="true" tabIndex={-1}>
                  <Picture src={NEWS_IMAGES[(i + 1) % NEWS_IMAGES.length]} alt="" loading="lazy" />
                </a>
                <div className="latest-small-news__body">
                  <div className="latest-meta"><time dateTime={a.date}>{a.date}</time></div>
                  <h3><a href={a.href || "#"}>{a.title}</a></h3>
                  {a.body ? <p>{a.body}</p> : null}
                  <div style={{ textAlign: "end" }}>
                    <a className="latest-main-news__link is-compact" href={a.href || "#"}>{b.readMoreLabel || "อ่านต่อ"}<span>→</span></a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: list-panel ---------- */
// Ported from KnowledgePage.tsx's "บทความล่าสุด" / ActivitiesPage.tsx's
// "ข่าวสารและกิจกรรม" — the plain `.rs-list` row treatment (no image), as
// opposed to news-feed's featured+grid cards.
function ListPanel({ b }: { b: Block }) {
  const items: { date?: string; tag?: string; title: string; body?: string; href?: string }[] = b.items || [];
  return (
    <Section b={b}>
      <ul className="rs-list">
        {items.map((it, i) => (
          <li className="rs-list-item" key={i}>
            {it.date ? <span className="rs-list-item__date"><strong>{it.date}</strong></span> : null}
            <div className="rs-list-item__body">
              {it.tag ? <span className="rs-list-item__tag">{it.tag}</span> : null}
              <h3><a href={it.href || "#"}>{it.title}</a></h3>
              {it.body ? <p>{it.body}</p> : null}
            </div>
            <span className="rs-list-item__arrow" aria-hidden="true">→</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- Block: card-grid ---------- */

function colsClass(n?: string | number) {
  const c = Number(n) || 3;
  return `rs-grid rs-grid--${Math.min(Math.max(c, 2), 4)}`;
}
function CardGrid({ b }: { b: Block }) {
  const items: { title: string; body?: string; image?: string; href?: string }[] = b.items || [];
  const flat = b.variant === "flat";
  return (
    <Section b={b}>
      <div className={colsClass(b.columns) + " reveal"}>
        {items.map((it, i) => (
          <article className={"rs-card" + (flat ? " rs-card--flat" : "")} key={i}>
            {!flat && it.image ? (
              <a className="rs-card__media" href={it.href || "#"}><Picture src={it.image} alt="" loading="lazy" /></a>
            ) : null}
            <div className="rs-card__body">
              <h3 className="rs-card__title"><a href={it.href || "#"}>{it.title}</a></h3>
              {it.body ? <p className="rs-card__excerpt">{it.body}</p> : null}
              <a className="rs-card__link" href={it.href || "#"}>{b.linkLabel || "ดูรายละเอียด →"}</a>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ---------- Block: table ---------- */

function TableBlock({ b }: { b: Block }) {
  const columns: string[] = b.columns || [];
  const rows: string[][] = b.rows || [];
  return (
    <Section b={b}>
      <ListExport title={b.heading || "รายการ"} columns={columns} rows={rows} />
      <div className="rs-table-wrap">
        <table className="rs-table">
          {b.caption ? <caption className="sr-only">{b.caption}</caption> : null}
          <thead><tr>{columns.map((c, i) => <th scope="col" key={i}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ---------- Block: event-calendar ---------- */
// Real "ปฏิทินกิจกรรม" — see components/EventCalendar.tsx's own file
// comment. activities.json's own lead copy already promised "ปฏิทิน
// กิจกรรมที่เปิดให้ประชาชนเข้าร่วม" with nothing behind it; this is that
// calendar, backed by real wp:event data (source: {kind:"wp",
// postType:"event", map:"calendar"}).
function EventCalendarBlock({ b }: { b: Block }) {
  return (
    <Section b={b}>
      <EventCalendar items={b.items || []} icsHref="/royalsociety/events.ics" />
    </Section>
  );
}

/* ---------- Block: member-directory ---------- */
// Real member/scholar directory — see components/MemberDirectory.tsx's own
// file comment. This page's own homepage card (content/home.json) promises
// "get to know" real Fellows/Associate Members and links here; this block
// is that promise fulfilled.
function MemberDirectoryBlock({ b, locale }: { b: Block; locale?: "th" | "en" }) {
  return (
    <Section b={b}>
      <MemberDirectory items={b.items || []} locale={locale} />
    </Section>
  );
}

/* ---------- Block: job-listing ---------- */
// Real job/application e-forms (TOR gap audit) — see orst/Blocks.tsx's
// identical block for the full reasoning; `b.jobs` is the same bespoke
// server-side merge pattern (app/royalsociety/[page]/page.tsx's "careers"
// branch).
function JobListingBlock({ b, tenant }: { b: Block; tenant: string }) {
  const jobs: JobPosting[] = b.jobs || [];
  return (
    <Section b={b}>
      {jobs.length === 0 ? (
        <p className="muted">{b.emptyLabel || "ขณะนี้ยังไม่มีตำแหน่งงานว่าง"}</p>
      ) : (
        <>
          <div className="wx-job-list">
            {jobs.map((j) => (
              <article className="wx-job-card rs-panel" key={j.jobId}>
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
          <div style={{ marginTop: 32 }}>
            {b.formHeading ? <h3>{b.formHeading}</h3> : null}
            <JobApplicationForm tenant={tenant} jobs={jobs} />
          </div>
        </>
      )}
    </Section>
  );
}

/* ---------- Block: faq ---------- */

function Faq({ b }: { b: Block }) {
  const items: { q: string; a: string }[] = b.items || [];
  return (
    <Section b={b}>
      <div className="rs-accordion">
        {items.map((it, i) => (
          <details key={i} open={i === 0}>
            <summary>{it.q}</summary>
            <div className="rs-accordion__body">{it.a}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ---------- Block: stats-steps ---------- */
// Ported from ServicesPage.tsx's "ยื่นเรื่องอย่างไร" — items are plain
// strings (`.rs-stat__label`); the numbered `.rs-stat__value` is the item's
// own position, same auto-numbering convention as ORST's `steps` block.
function StatsSteps({ b }: { b: Block }) {
  const items: string[] = b.items || [];
  return (
    <Section b={b}>
      <div className="rs-stats">
        {items.map((label, i) => (
          <div className="rs-stat" key={i}>
            <span className="rs-stat__value">{i + 1}</span>
            <span className="rs-stat__label">{label}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------- Block: notice ---------- */

function Notice({ b }: { b: Block }) {
  const tone = ["warn", "success"].includes(b.tone) ? " rs-note--" + b.tone : "";
  return (
    <Section b={{ ...b, heading: undefined, lead: undefined }}>
      <div className={"rs-note" + tone}>
        {b.title ? <strong>{b.title}</strong> : null}
        {b.body}
      </div>
    </Section>
  );
}

/* ---------- Block: cta-band ---------- */
// Reused for both KnowledgePage's closing CTA panel and AboutPage's
// contact-strip — both are "heading + body + action buttons" in the
// original source, just with slightly different wrapper markup
// (`.rs-panel--deep` vs `.about-contact-strip`). Rendered uniformly as the
// `.rs-panel--deep` treatment, a minor deliberate fidelity simplification
// (same category as ORST's department-cards-reuse-card-grid decision).
type CtaAction = { label: string; href: string; variant?: string };
function CtaBand({ b }: { b: Block }) {
  const actions: CtaAction[] = b.actions || [];
  return (
    <section className="section" id={b.id}>
      <div className="container">
        <div className="rs-panel rs-panel--deep">
          {/* The one ornamental moment on the page. A closing band is where
              a printed institutional document would carry a device, and this
              is the ceremonial sibling of the two tenants — see .rs-ornament
              in 04-components.css for why it stays a single restrained mark
              rather than a repeating pattern. */}
          <span className="rs-ornament" aria-hidden="true" />
          {b.eyebrow ? <span className="about-kicker">{b.eyebrow}</span> : null}
          <h2>{b.heading}</h2>
          {b.body ? <p>{b.body}</p> : null}
          {actions.length ? (
            <div className="rs-btn-row" style={{ marginTop: 18 }}>
              {actions.map((a, i) => (
                <a key={i} className={"rs-btn " + (a.variant === "ghost" ? "rs-btn--ghost" : "rs-btn--gold")} href={a.href || "#"}>{a.label}</a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: contact-info ---------- */
// `hours` is a single summary line rather than the source's 3-row weekly
// table (จันทร์-ศุกร์ / เสาร์-อาทิตย์ / วันหยุดนักขัตฤกษ์) — a minor
// fidelity simplification, same spirit as ORST's contact-info dropping its
// copy-to-clipboard buttons (users can still read the hours; the table
// added structure without adding information a plain line doesn't already
// carry).
// `mapEmbed` (an optional Google Maps embed src) matches ORST's own
// contact-info field of the same name — that block already had it, this one
// didn't (TOR gap audit). Rendered as its own panel rather than inside the
// text panel so the iframe gets real height without fighting `.rs-panel`'s
// padding.
// Bilingual EN (TOR gap) — see orst/Blocks.tsx's identical CONTACT_LABELS
// comment for why these need to be locale-aware.
const CONTACT_LABELS = {
  th: { phone: "โทรศัพท์", email: "อีเมล", hours: "เวลาทำการ", map: "แผนที่" },
  en: { phone: "Phone", email: "Email", hours: "Hours", map: "Map" },
} as const;
function ContactInfo({ b, locale = "th" }: { b: Block; locale?: "th" | "en" }) {
  const l = CONTACT_LABELS[locale];
  return (
    <section className="section" id={b.id}>
      <div className="container">
        <div className="rs-panel rs-panel--deep">
          {b.heading ? <h3 style={{ marginTop: 0 }}>{b.heading}</h3> : null}
          {b.address ? <p>{b.address}</p> : null}
          <p>
            {b.phone ? <>{l.phone} <strong>{b.phone}</strong><br /></> : null}
            {b.email ? <>{l.email} <strong>{b.email}</strong></> : null}
          </p>
          {b.hours ? <p className="rs-field__hint">{l.hours}: {b.hours}</p> : null}
        </div>
        {b.mapEmbed ? (
          <div className="rs-contact-map">
            <iframe src={b.mapEmbed} title={l.map} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ---------- Block: contact-form ---------- */
// ContactForm (ContactInteractive.tsx) is already a self-contained "use
// client" component with its own real submit handling (no render-prop
// function, unlike ORST's ContactForm) — a Server Component can render it
// directly as a child with no extra client-boundary file needed.

function ContactFormSection({ b }: { b: Block }) {
  return (
    <Section b={b}>
      <ContactForm tenant="royalsociety" />
    </Section>
  );
}

/* ---------- Block: intro-feature ---------- */
// Ported from AboutPage.tsx's "about-intro-v3". `html` is a bespoke
// server-side merge from the wp:page "about" post's own native `content`
// field (see app/royalsociety/[page]/page.tsx) — same trust boundary and
// same reason ORST's `rich-text` never exposes a raw-HTML field in the
// Builder palette (governance.ts's hasEmbedBlock gate covers exactly this
// sink; not adding a second one here).
type StoryCard = { label: string; title: string; body: string };
function IntroFeature({ b }: { b: Block }) {
  const cards: StoryCard[] = b.items || [];
  return (
    <section className="about-intro-v3 section-soft" aria-labelledby="about-intro-title">
      <div className="about-container">
        <div className="about-intro-v3-grid">
          <div className="about-intro-v3-feature">
            {b.eyebrow ? <span className="about-kicker-light">{b.eyebrow}</span> : null}
            <h2 id="about-intro-title">{b.heading}</h2>
            {b.html ? <div dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(b.html) }} /> : null}
            {b.highlightLabel ? (
              <div className="about-intro-v3-highlight">
                <strong>{b.highlightLabel}</strong>
                <span>{b.highlightText}</span>
              </div>
            ) : null}
          </div>

          <div className="about-intro-v3-story" aria-label="ภาพรวมพัฒนาการของราชบัณฑิตยสภา">
            {cards.map((c, i) => (
              <article className={"about-story-v3-card" + (i === cards.length - 1 ? " accent" : "")} key={i}>
                <span className="story-v3-label">{c.label}</span>
                <div className="story-v3-number">{String(i + 1).padStart(2, "0")}</div>
                <div><h3>{c.title}</h3><p>{c.body}</p></div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: timeline ---------- */

function Timeline({ b }: { b: Block }) {
  const items: { year?: string; statusLabel?: string; title: string; body?: string }[] = b.items || [];
  return (
    <section className="about-history-v2" id={b.id} aria-labelledby="history-title">
      <div className="about-container">
        <div className="about-history-head">
          {b.eyebrow ? <span className="about-kicker">{b.eyebrow}</span> : null}
          <h2 id="history-title">{b.heading}</h2>
          {b.lead ? <p>{b.lead}</p> : null}
        </div>
        <div className="history-timeline-v2" aria-label="ลำดับเหตุการณ์สำคัญของราชบัณฑิตยสภา">
          {items.map((e, i) => (
            <article className={"history-item-v2" + (i === 0 ? " is-featured" : i === items.length - 1 ? " is-current" : "")} key={i}>
              <div className="history-year"><time dateTime={e.year || ""}>{e.year || ""}</time></div>
              <div className="history-card">
                {e.statusLabel ? <span className="history-status">{e.statusLabel}</span> : null}
                <h3>{e.title}</h3>
                {e.body ? <p>{e.body}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: mission-grid ---------- */

function MissionGrid({ b }: { b: Block }) {
  const items: { icon?: string; title: string; body?: string }[] = b.items || [];
  return (
    <section className="mission-v2" id={b.id} aria-labelledby="mission-title">
      <div className="about-container">
        <div className="mission-v2-grid">
          <div className="mission-v2-head">
            {b.eyebrow ? <span className="about-kicker">{b.eyebrow}</span> : null}
            <h2 id="mission-title">{b.heading}</h2>
            {b.lead ? <p>{b.lead}</p> : null}
            {b.linkLabel ? <a href={b.linkHref || "#"} className="mission-v2-link">{b.linkLabel}<span>→</span></a> : null}
          </div>
          <div className="mission-v2-list" aria-label="บทบาทและภารกิจสำคัญของราชบัณฑิตยสภา">
            {items.map((e, i) => (
              <article className={"mission-v2-card" + (i === items.length - 1 ? " is-emphasis" : "")} key={i}>
                <span className="mission-v2-icon" aria-hidden="true"><SafeRsIcon id={e.icon} /></span>
                <span className="mission-v2-number">{String(i + 1).padStart(2, "0")}</span>
                <div><h3>{e.title}</h3>{e.body ? <p>{e.body}</p> : null}</div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: org-structure ---------- */
// The two `.structure-main-card` (council/office) stay editable framing
// text; only the school/bureau grid is source-bindable (WP org-unit).

function OrgStructure({ b }: { b: Block }) {
  const items: { title: string; body?: string }[] = b.items || [];
  return (
    <section className="structure-v2" id={b.id} aria-labelledby="structure-title">
      <div className="about-container">
        <div className="structure-v2-grid">
          <div className="structure-v2-head">
            {b.eyebrow ? <span className="about-kicker">{b.eyebrow}</span> : null}
            <h2 id="structure-title">{b.heading}</h2>
            {b.lead ? <p>{b.lead}</p> : null}
            {b.image ? (
              <figure className="structure-v2-image"><Picture src={b.image} alt="" loading="lazy" /></figure>
            ) : null}
          </div>

          <div className="structure-v2-content">
            <div className="structure-main-flow" aria-label="ส่วนงานหลักของราชบัณฑิตยสภา">
              <article className="structure-main-card">
                {b.councilLabel ? <span className="structure-label">{b.councilLabel}</span> : null}
                <h3>{b.councilTitle}</h3>
                {b.councilBody ? <p>{b.councilBody}</p> : null}
              </article>
              <div className="structure-connector" aria-hidden="true"><span></span></div>
              <article className="structure-main-card soft">
                {b.officeLabel ? <span className="structure-label">{b.officeLabel}</span> : null}
                <h3>{b.officeTitle}</h3>
                {b.officeBody ? <p>{b.officeBody}</p> : null}
              </article>
            </div>

            <div className="structure-schools">
              <div className="structure-schools-head">
                <h3>{b.schoolsHeading}</h3>
                {b.schoolsLead ? <p>{b.schoolsLead}</p> : null}
              </div>
              <div className="school-v2-grid" aria-label="สามสำนักของราชบัณฑิตยสภา">
                {items.map((e, i) => (
                  <a href="#" className="school-v2-card" key={i}>
                    <span className="school-index">{String(i + 1).padStart(2, "0")}</span>
                    <strong>{e.title}</strong>
                    {e.body ? <span>{e.body}</span> : null}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: feature-directory ---------- */
// Unifies HomePage.tsx's "key-services" and AboutPage.tsx's
// "knowledge-standards-v2" — both are a "feature card + grid of small
// cards" layout, just with different wrapper classes; `variant` picks which.
// Per-card icons (both sections used hand-drawn inline SVG paths, not sprite
// ids) are dropped — text-only cards — same simplification ORST's
// service-hub already accepted for the identical reason.
type DirItem = { title: string; body?: string; href?: string; linkLabel?: string };
function FeatureDirectory({ b }: { b: Block }) {
  const items: DirItem[] = b.items || [];
  if (b.variant === "knowledge") {
    return (
      <section className="knowledge-standards-v2" id={b.id} aria-labelledby="knowledge-title">
        <div className="about-container">
          <div className="knowledge-standards-head">
            {b.eyebrow ? <span className="about-kicker">{b.eyebrow}</span> : null}
            <h2 id="knowledge-title">{b.heading}</h2>
            {b.lead ? <p>{b.lead}</p> : null}
          </div>
          <div className="knowledge-standards-layout">
            <article className="knowledge-feature-card">
              {b.featureLabel ? <span className="knowledge-label">{b.featureLabel}</span> : null}
              <h3>{b.featureTitle}</h3>
              {b.featureBody ? <p>{b.featureBody}</p> : null}
              {b.featureLinkLabel ? <a href={b.featureLinkUrl || "#"} className="knowledge-feature-link">{b.featureLinkLabel}<span>→</span></a> : null}
            </article>
            <div className="knowledge-standards-grid">
              {items.map((it, i) => (
                <article className="knowledge-standard-card" key={i}>
                  <div>
                    <h3>{it.title}</h3>
                    {it.body ? <p>{it.body}</p> : null}
                    <a href={it.href || "#"}>{it.linkLabel || b.linkLabel || "เปิดดู"} <span>→</span></a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="key-services section" id={b.id} aria-labelledby="services-title">
      <div className="container">
        <div className="ks-layout reveal">
          <div className="ks-main ks-feature-card">
            {b.eyebrow ? <span className="section-kicker">{b.eyebrow}</span> : null}
            <h3 id="services-title">{b.heading}</h3>
            {b.lead ? <p>{b.lead}</p> : null}
          </div>
        </div>
        <div className="ks-grid reveal">
          {items.map((it, i) => (
            <a className="ks-card" href={it.href || "#"} key={i}>
              <span className="ks-card-text"><strong>{it.title}</strong>{it.body ? <small>{it.body}</small> : null}</span>
              <span className="ks-arrow">→</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: recommended-carousel ---------- */

type RecItem = { image?: string; type?: string; category?: string; title: string; body?: string; href?: string; linkLabel?: string };
function RecommendedCarousel({ b }: { b: Block }) {
  const items: RecItem[] = b.items || [];
  const rowId = (b.id || "recommend") + "-row";
  return (
    <section className="recommended-section section" id={b.id} aria-labelledby="recommended-title">
      <div className="container">
        <div className="rec-head reveal">
          <div>
            {b.eyebrow ? <span className="section-kicker">{b.eyebrow}</span> : null}
            <h2 id="recommended-title">{b.heading}</h2>
            {b.lead ? <p>{b.lead}</p> : null}
          </div>
          <div className="rec-actions">
            {b.viewAllLabel ? <a className="rec-view-all" href={b.viewAllUrl || "#"}>{b.viewAllLabel}</a> : null}
            <RsScrollButton rowId={rowId} dir="left" label="เลื่อนรายการไปทางซ้าย" />
            <RsScrollButton rowId={rowId} dir="right" label="เลื่อนรายการไปทางขวา" />
          </div>
        </div>

        <div className="rec-shell reveal">
          <div className="rec-row" id={rowId} tabIndex={0} aria-label="รายการองค์ความรู้แนะนำแบบเลื่อนได้">
            {items.map((it, i) => (
              <article className={"rec-card" + (i === 0 ? " featured" : "")} key={i}>
                <a href={it.href || "#"} className="rec-cover">
                  {it.image ? <Picture src={it.image} alt="" loading="lazy" /> : null}
                  {it.type ? <span className="rec-type">{it.type}</span> : null}
                </a>
                <div className="rec-body">
                  {it.category ? <span className="rec-category">{it.category}</span> : null}
                  <h3>{it.title}</h3>
                  {it.body ? <p>{it.body}</p> : null}
                  <a className="rec-link" href={it.href || "#"}>{it.linkLabel || "ดูรายละเอียด"}<span>→</span></a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: service-gateway ---------- */
// Ported from HomePage.tsx's "public-service" section. The main-service and
// per-item icons are the source's own hand-drawn inline SVGs (not RsIcon
// ids) — kept as-is (fixed, non-data-driven paths) rather than approximated
// with a possibly-wrong RsIcon id, same call as feature-directory's icons.

type GatewayItem = { label?: string; title: string; body?: string; href?: string };
function ServiceGateway({ b }: { b: Block }) {
  const items: GatewayItem[] = b.items || [];
  const steps: string[] = b.steps || [];
  return (
    <section className="public-service section ps-gateway-section" id={b.id} aria-labelledby="public-service-title">
      <div className="container">
        <div className="ps-gateway-head reveal">
          <div>
            {b.eyebrow ? <span className="section-kicker">{b.eyebrow}</span> : null}
            <h2 id="public-service-title">{b.heading}</h2>
            {b.lead ? <p>{b.lead}</p> : null}
          </div>
          {b.viewAllLabel ? <a className="ps-gateway-all" href={b.viewAllUrl || "#"}>{b.viewAllLabel}<span>→</span></a> : null}
        </div>

        <div className="ps-gateway-layout reveal">
          <a className="ps-main-service" href={b.mainHref || "#"}>
            {b.mainLabel ? <span className="ps-main-service__label">{b.mainLabel}</span> : null}
            <span className="ps-main-service__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4.5 5.5h15v10h-8L7 19v-3.5H4.5v-10Z"></path><path d="M8 9h8M8 12h5"></path></svg>
            </span>
            <span className="ps-main-service__text">
              <strong>{b.mainTitle}</strong>
              {b.mainBody ? <em>{b.mainBody}</em> : null}
            </span>
            {b.mainActionLabel ? <span className="ps-main-service__action">{b.mainActionLabel}<i>→</i></span> : null}
          </a>

          <div className="ps-service-list" aria-label="รายการบริการประชาชน">
            {items.map((it, i) => (
              <a className="ps-service-item" href={it.href || "#"} key={i}>
                <span className="ps-service-item__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M6 4h9.5L19 8.5V20H6V4Z"></path><path d="M15.5 4v4.5H19"></path><path d="M9 12h6M9 15h4"></path></svg>
                </span>
                <span className="ps-service-item__text">
                  {it.label ? <small>{it.label}</small> : null}
                  <strong>{it.title}</strong>
                  {it.body ? <em>{it.body}</em> : null}
                </span>
                <span className="ps-service-item__arrow">→</span>
              </a>
            ))}
          </div>
        </div>

        {steps.length ? (
          <div className="ps-process-strip reveal" aria-label="ขั้นตอนการใช้บริการ">
            {b.processLabel ? <span>{b.processLabel}</span> : null}
            <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ---------- Block: logo-marquee ---------- */
// Ported from HomePage.tsx's "connected-network" section — same
// duplicate-the-list-for-a-seamless-CSS-loop trick as ORST's logo-marquee.

function LogoMarquee({ b }: { b: Block }) {
  const items: { name: string; image?: string; href?: string }[] = b.items || [];
  const group = (hidden: boolean) => (
    <div className="cn-marquee__group" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <a className="cn-logo-card" href={it.href || "#"} key={i} target={hidden ? undefined : "_blank"} rel={hidden ? undefined : "noopener"} tabIndex={hidden ? -1 : undefined}>
          <span>{it.image ? <Picture src={it.image} alt={hidden ? "" : it.name} loading="lazy" decoding="async" /> : null}</span>
          <strong>{it.name}</strong>
        </a>
      ))}
    </div>
  );
  return (
    <section className="cn-section cn-marquee-section" id={b.id} aria-labelledby="network-title">
      <div className="container">
        <div className="cn-marquee-head reveal">
          <div>
            {b.eyebrow ? <span className="section-kicker">{b.eyebrow}</span> : null}
            <h2 id="network-title">{b.heading}</h2>
            {b.lead ? <p>{b.lead}</p> : null}
          </div>
          {b.viewAllLabel ? <a className="cn-view-all" href={b.viewAllUrl || "#"}>{b.viewAllLabel}<span>→</span></a> : null}
        </div>
      </div>
      <div className="cn-marquee reveal" aria-label="รายการหน่วยงานและระบบที่เกี่ยวข้อง">
        <div className="cn-marquee__viewport">
          <div className="cn-marquee__track">{group(false)}{group(true)}</div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: vm-strip ---------- */

function VmStrip({ b }: { b: Block }) {
  const items: string[] = b.items || [];
  return (
    <section className="vm-strip-section" id={b.id} aria-label="วิสัยทัศน์และพันธกิจราชบัณฑิตยสภา">
      <div className="container">
        <div className="vm-strip reveal">
          <div className="vm-strip__items">{items.map((s, i) => <span key={i}>{s}</span>)}</div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Block: flex-panel ---------- */
// The one "no-code new block" escape hatch for this template — see ORST
// Blocks.tsx's identical FlexPanel for the full rationale (BlockTypeEditor's
// open-ended HTML-template mechanism is gov-portal-only and can't safely
// reuse this template's own CSS classes). One coded block type, six
// pre-built layouts, each reusing an existing block's own markup/classes —
// composable without a developer, but not open-ended. `feature` is the one
// asymmetric layout: it reuses TrustStrip's `.trust-strip` band, whose dark
// background is load-bearing, so unlike ORST's equivalent it can't also
// carry a heading/lead.
function FlexPanel({ b }: { b: Block }) {
  const items: { icon?: string; title?: string; body?: string; href?: string }[] = b.items || [];
  const layout = b.layout || "cards";
  const toneClass = ["warn", "success"].includes(b.tone) ? " rs-note--" + b.tone : "";

  if (layout === "banner") {
    return (
      <Section b={{ ...b, heading: undefined, lead: undefined }}>
        <div className={"rs-note" + toneClass}>
          {b.heading ? <strong>{b.heading}</strong> : null}
          {b.lead}
        </div>
      </Section>
    );
  }

  if (layout === "list") {
    return (
      <Section b={b}>
        <ul className="rs-list">
          {items.map((it, i) => (
            <li className="rs-list-item" key={i}>
              <div className="rs-list-item__body">
                <h3><a href={it.href || "#"}>{it.title}</a></h3>
                {it.body ? <p>{it.body}</p> : null}
              </div>
              <span className="rs-list-item__arrow" aria-hidden="true">→</span>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  if (layout === "cta") {
    return (
      <section className="section" id={b.id}>
        <div className="container">
          <div className="rs-panel rs-panel--deep">
            <h2>{b.heading}</h2>
            {b.lead ? <p>{b.lead}</p> : null}
            {items.length ? (
              <div className="rs-btn-row" style={{ marginTop: 18 }}>
                {items.map((it, i) => (
                  <a key={i} className="rs-btn rs-btn--gold" href={it.href || "#"}>{it.title}</a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (layout === "stats") {
    return (
      <Section b={b}>
        <div className="rs-stats">
          {items.map((it, i) => (
            <div className="rs-stat" key={i}>
              <span className="rs-stat__value">{it.title}</span>
              {it.body ? <span className="rs-stat__label">{it.body}</span> : null}
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (layout === "feature") {
    // Reuses the home page's `.trust-strip` band verbatim — that block's own
    // dark background is load-bearing (`.trust-item h3` is hardcoded white
    // text), so unlike the other FlexPanel layouts this one can't also carry
    // a heading/lead: TrustStrip's own dedicated block never supported that
    // either.
    return (
      <section className="trust-strip" id={b.id}>
        <div className="container trust-grid">
          {items.map((it, i) => (
            <article className="trust-item" key={i}>
              <SafeRsIcon id={it.icon} className="icon trust-icon" />
              <div><h3>{it.title}</h3></div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  // default: cards
  return (
    <Section b={b}>
      <div className={colsClass(items.length >= 4 ? "4" : "3")}>
        {items.map((it, i) => (
          <article className="rs-card rs-card--flat" key={i}>
            <div className="rs-card__body">
              <h3 className="rs-card__title"><a href={it.href || "#"}>{it.title}</a></h3>
              {it.body ? <p className="rs-card__excerpt">{it.body}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ---------- registry ---------- */

// Bilingual EN (TOR gap) — locale is optional and ignored by every renderer
// except member-directory (see orst/Blocks.tsx's identical comment).
const BLOCKS: Record<string, (b: Block, locale?: "th" | "en") => ReactNode> = {
  "page-hero": (b, locale) => <PageHero b={b} locale={locale} />,
  "about-hero": (b, locale) => <AboutHero b={b} locale={locale} />,
  "home-hero": (b) => <HomeHero b={b} />,
  "trust-strip": (b) => <TrustStrip b={b} />,
  "news-feed": (b) => <NewsFeed b={b} />,
  "list-panel": (b) => <ListPanel b={b} />,
  "card-grid": (b) => <CardGrid b={b} />,
  table: (b) => <TableBlock b={b} />,
  faq: (b) => <Faq b={b} />,
  "stats-steps": (b) => <StatsSteps b={b} />,
  notice: (b) => <Notice b={b} />,
  "cta-band": (b) => <CtaBand b={b} />,
  "contact-info": (b, locale) => <ContactInfo b={b} locale={locale} />,
  "contact-form": (b) => <ContactFormSection b={b} />,
  "intro-feature": (b) => <IntroFeature b={b} />,
  timeline: (b) => <Timeline b={b} />,
  "mission-grid": (b) => <MissionGrid b={b} />,
  "org-structure": (b) => <OrgStructure b={b} />,
  "feature-directory": (b) => <FeatureDirectory b={b} />,
  "recommended-carousel": (b) => <RecommendedCarousel b={b} />,
  "service-gateway": (b) => <ServiceGateway b={b} />,
  "logo-marquee": (b) => <LogoMarquee b={b} />,
  "vm-strip": (b) => <VmStrip b={b} />,
  "flex-panel": (b) => <FlexPanel b={b} />,
  "event-calendar": (b) => <EventCalendarBlock b={b} />,
  "member-directory": (b, locale) => <MemberDirectoryBlock b={b} locale={locale} />,
  "job-listing": (b) => <JobListingBlock b={b} tenant="royalsociety" />,
};

const BLOCK_TYPES = Object.keys(BLOCKS);

function UnknownBlock({ label, detail }: { label: string; detail: string }) {
  return (
    <section className="section">
      <div className="container">
        <div className="rs-note rs-note--warn" role="note">
          <strong>{label}</strong>
          {detail}
        </div>
      </div>
    </section>
  );
}

export default function Blocks({ blocks, locale }: { blocks: Block[]; locale?: "th" | "en" }) {
  return (
    <>
      {(blocks || []).map((block, index) => {
        const key = block?.id || index;
        const render = block?.type ? BLOCKS[block.type] : undefined;
        if (!render) {
          return (
            <Fragment key={key}>
              <UnknownBlock label={`ไม่รู้จัก block ชนิด "${block?.type}" (ลำดับที่ ${index + 1})`} detail={`ชนิดที่ใช้ได้: ${BLOCK_TYPES.join(", ")}`} />
            </Fragment>
          );
        }
        try {
          return <Fragment key={key}>{render(block, locale)}</Fragment>;
        } catch (error: any) {
          return (
            <Fragment key={key}>
              <UnknownBlock label={`สร้าง block "${block.type}" (ลำดับที่ ${index + 1}) ไม่สำเร็จ`} detail={error?.message || String(error)} />
            </Fragment>
          );
        }
      })}
    </>
  );
}
