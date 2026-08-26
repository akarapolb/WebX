import { notFound } from "next/navigation";
import Header from "@/templates/orst/Header";
import Footer from "@/templates/orst/Footer";
import Blocks from "@/templates/orst/Blocks";
import KnowledgePage from "@/templates/orst/KnowledgePage";
import ContactPage from "@/templates/orst/ContactPage";
import aboutData from "@/templates/orst/content/about.json";
import dictionaryData from "@/templates/orst/content/dictionary.json";
import newsData from "@/templates/orst/content/news.json";
import publicationsData from "@/templates/orst/content/publications.json";
import servicesData from "@/templates/orst/content/services.json";
import { getWpServices, getWpPublications, getWpNews, getWpPage, getWpFaqs, getWpResources, getWpTimeline, getWpMissionItems, getWpOrgUnits, getWpDocuments, getTenant, fmtDateTh, type WpEntry } from "@/lib/cms";

// The 5 JSON-block-driven pages (source: content/pages/*.json, rendered via
// templates/orst/Blocks.tsx) plus knowledge/contact, which are hand-written
// in the source and have their own dedicated components.
const BLOCK_PAGES: Record<string, { navKey: string; blocks: any[] }> = {
  about: aboutData as any,
  dictionary: dictionaryData as any,
  news: newsData as any,
  publications: publicationsData as any,
  services: servicesData as any,
};
const HAND_WRITTEN_PAGES = new Set(["knowledge", "contact"]);

/** Swap one block's static `items` for real WordPress content by block id —
 * everything else on the page (hero, steps, FAQ, ITA docs, etc.) stays the
 * static JSON exactly as ported. See the Phase 8 plan's scope boundary:
 * services/publications/news are the content types that actually became
 * WordPress custom post types; this is where that connects to the page. */
function withItems(blocks: any[], blockId: string, items: any[]): any[] {
  return blocks.map((b) => (b.id === blockId ? { ...b, items } : b));
}
function toCardItems(entries: WpEntry[], icon: string): any[] {
  return entries.map((e) => ({ icon, title: e.title, body: e.excerpt, meta: fmtDateTh(e.date), href: "#" }));
}
function toFaqItems(entries: WpEntry[]): { q: string; a: string }[] {
  return entries.map((e) => ({ q: e.title, a: e.excerpt }));
}
function toLinkItems(entries: WpEntry[], icon: string): any[] {
  return entries.map((e) => ({ icon, title: e.title, desc: e.excerpt, meta: fmtDateTh(e.date), href: "#" }));
}

/** Merge arbitrary field overrides into one block by id — used for the
 * about page's rich-text ("html" override, replacing its placeholder
 * `paragraphs`) where withItems' `items`-only shape doesn't apply. */
function withFields(blocks: any[], blockId: string, fields: Record<string, any>): any[] {
  return blocks.map((b) => (b.id === blockId ? { ...b, ...fields } : b));
}

export function generateStaticParams() {
  return [...Object.keys(BLOCK_PAGES), ...HAND_WRITTEN_PAGES].map((page) => ({ page }));
}

export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;

  if (page === "knowledge") {
    const tenant = await getTenant("orst");
    return (
      <>
        <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
        <Header active="knowledge" />
        <KnowledgePage />
        <Footer tenant={tenant} />
      </>
    );
  }
  if (page === "contact") {
    const tenant = await getTenant("orst");
    return (
      <>
        <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
        <Header active="contact" />
        <ContactPage />
        <Footer tenant={tenant} />
      </>
    );
  }

  const data = BLOCK_PAGES[page];
  if (!data) return notFound();

  let blocks = data.blocks;
  if (page === "services") {
    blocks = withItems(blocks, "online-services", toCardItems(await getWpServices("orst"), "i-form"));
  } else if (page === "publications") {
    // Real publications for orst top out at 3 entries — reused as-is for
    // both the card-grid ("media") and this link-list ("journals"), same
    // real data in two presentations, rather than a second fabricated list.
    const pubs = await getWpPublications("orst");
    blocks = withItems(blocks, "media", toCardItems(pubs, "i-video"));
    blocks = withItems(blocks, "journals", toLinkItems(pubs, "i-journal"));
  } else if (page === "news") {
    // Real posts seeded for orst (see the Phase 10 news seed — genuine
    // source-design content, not invented) sort newest-first; the 5 "news"
    // items and 5 "announcement" items were seeded as two same-day batches
    // with the announcement batch dated earlier, so a straight split lines
    // up with the source's own news/announcement distinction without a
    // separate taxonomy.
    const posts = await getWpNews("orst");
    blocks = withItems(blocks, "highlight", toCardItems(posts.slice(0, 5), "i-megaphone").map((it) => ({ ...it, tag: "ข่าวประชาสัมพันธ์" })));
    blocks = withItems(blocks, "announcements", toLinkItems(posts.slice(5, 10), "i-file"));
  } else if (page === "about") {
    // Real narrative from wp:page slug "about" (sourced from the RoyalSociety
    // sister-design's About page — ORST's own about.json content was an
    // unfilled placeholder). RichText already supports raw HTML via `b.html`
    // (see Blocks.tsx), so just hand it the fetched content directly instead
    // of the static `paragraphs` placeholders — leave the block untouched
    // (bracketed placeholders and all) if the page hasn't been seeded yet.
    const [aboutPage, missionItems, orgUnits, timeline, documents] = await Promise.all([
      getWpPage("orst", "about"),
      getWpMissionItems("orst"),
      getWpOrgUnits("orst"),
      getWpTimeline("orst"),
      getWpDocuments("orst"),
    ]);
    if (aboutPage?.content) {
      blocks = withFields(blocks, "overview", { html: aboutPage.content });
    }

    // Phase 10 — mission/structure are now genuine WordPress content types
    // (wp:mission, wp:org-unit) instead of hardcoded JSX/JSON.
    if (missionItems.length) {
      blocks = withItems(blocks, "mission", missionItems.map((e) => ({
        icon: e.acf?.icon || "i-service", title: e.title, body: e.excerpt,
      })));
    }
    if (orgUnits.length) {
      blocks = withItems(blocks, "structure", orgUnits.map((e) => ({
        icon: "i-dictionary", title: e.title, body: e.excerpt, href: "#",
      })));
    }

    // The "at-a-glance" facts are a summary of data already live on this
    // page (founding year and current-law year are the timeline's earliest/
    // latest entries; bureau count is org-units' length) — derived rather
    // than a 4th hand-authored content type for 3 numbers, so it can never
    // drift out of sync with the timeline/structure it's summarizing.
    blocks = withFields(blocks, "at-a-glance", { lead: "ข้อมูล ณ ปัจจุบัน" });
    if (timeline.length && orgUnits.length) {
      blocks = withItems(blocks, "at-a-glance", [
        { value: timeline[0].acf?.year || "", label: "ปีที่ก่อตั้ง", note: "สถาปนา" },
        { value: timeline[timeline.length - 1].acf?.year || "", label: "พระราชบัญญัติฉบับปัจจุบัน", note: "กฎหมายปัจจุบัน" },
        { value: orgUnits.length + " สำนัก", label: "สำนักวิชาการ", note: "โครงสร้างวิชาการ" },
      ]);
    }

    // ITA transparency documents — real titles, honest empty tag/date/link
    // until the real files exist (see wp:document's seed data and the
    // Phase 9/10 "don't fabricate" line).
    if (documents.length) {
      blocks = withItems(blocks, "transparency", documents.map((e) => ({
        title: e.title,
        desc: e.excerpt,
        tag: e.acf?.tag || "PDF",
        meta: e.acf?.fiscal_year || undefined,
        href: e.acf?.file_url || "#",
      })));
    }
  } else if (page === "dictionary") {
    blocks = withItems(blocks, "services", toCardItems(await getWpResources("orst"), "i-dictionary"));
    blocks = withItems(blocks, "faq", toFaqItems((await getWpFaqs("orst")).slice(0, 4)));
  }

  const tenant = await getTenant("orst");

  return (
    <>
      <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <Header active={data.navKey} />
      <main id="main-content">
        <div id="app-content">
          <Blocks blocks={blocks} />
        </div>
      </main>
      <Footer tenant={tenant} />
    </>
  );
}
