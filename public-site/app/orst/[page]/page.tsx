import { notFound } from "next/navigation";
import Header from "@/templates/orst/Header";
import Footer from "@/templates/orst/Footer";
import Blocks from "@/templates/orst/Blocks";
import aboutData from "@/templates/orst/content/about.json";
import dictionaryData from "@/templates/orst/content/dictionary.json";
import newsData from "@/templates/orst/content/news.json";
import publicationsData from "@/templates/orst/content/publications.json";
import servicesData from "@/templates/orst/content/services.json";
import contactData from "@/templates/orst/content/contact.json";
import knowledgeData from "@/templates/orst/content/knowledge.json";
import careersData from "@/templates/orst/content/careers.json";
// getWpTimeline/getWpOrgUnits are still fetched directly here (not through
// resolveSources) for the "at-a-glance" block's cross-source aggregation —
// see its own comment below for why that one stays bespoke. getWpOrgUnits
// is ALSO fetched independently, once more, inside resolveSources for the
// "structure" block's own items — a small, build-time-only duplication
// (this route runs once per static export, not per request) traded for not
// threading a shared cache between two independent mechanisms.
import { getWpPage, getWpTimeline, getWpOrgUnits, getWpMembers, getJobs, getTenant, getNavItems, listWpPageSlugs, getCustomIcons } from "@/lib/cms";
import { resolveSources } from "@/lib/blockSource";
import { pageMetadata } from "@/lib/seo";

// The 7 JSON-block-driven pages (rendered via templates/orst/Blocks.tsx).
// contact and knowledge both joined this list via full decomposition —
// contact into contact-hero/contact-info/contact-form/card-grid (see
// Blocks.tsx, content/contact.json); knowledge into stats-hero/card-grid
// (content/knowledge.json), dropping its non-functional filter/search/
// pagination chrome per an explicit product call (that page's own source
// comments confirmed the "185,420 items" archive and its facet browser
// were entirely decorative — no real filtering, no real data behind them).
// ContactPage.tsx/KnowledgePage.tsx and their dedicated route branches are
// gone. No hand-written ORST content pages remain.
const BLOCK_PAGES: Record<string, { navKey: string; blocks: any[] }> = {
  about: aboutData as any,
  dictionary: dictionaryData as any,
  news: newsData as any,
  publications: publicationsData as any,
  services: servicesData as any,
  contact: contactData as any,
  knowledge: knowledgeData as any,
  careers: careersData as any,
};

/** Merge arbitrary field overrides into one block by id — used for the
 * about page's rich-text ("html" override, replacing its placeholder
 * `paragraphs`) where withItems' `items`-only shape doesn't apply. */
function withFields(blocks: any[], blockId: string, fields: Record<string, any>): any[] {
  return blocks.map((b) => (b.id === blockId ? { ...b, ...fields } : b));
}

// The hardcoded map below is the set of pages this route was originally
// seeded with (each one bundling a content/*.json envelope). A page created
// afterwards in the Visual Builder exists only in WordPress, so enumerating
// just the map left it with no route at all — reported live as "created the
// page but there's no URL for it". Union the two: bundled pages keep their
// envelope, Builder-authored ones render straight from WordPress.
export async function generateStaticParams() {
  const authored = await listWpPageSlugs("orst");
  return [...new Set([...Object.keys(BLOCK_PAGES), ...authored])].map((page) => ({ page }));
}

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (!BLOCK_PAGES[page]) return {};
  const [wpPage, tenant, navItems] = await Promise.all([getWpPage("orst", page), getTenant("orst"), getNavItems("orst")]);
  // Real nav label for this page as the fallback title — same Thai text a
  // visitor already sees in the header, so no metadata-only copy to author.
  const navLabel = navItems.find((n) => n.url === "/orst/" + page)?.label || page;
  return pageMetadata({
    tenant: "orst", tenantData: tenant, path: "/orst/" + page,
    title: wpPage?.title, description: wpPage?.excerpt, imageUrl: wpPage?.imageUrl,
    fallbackTitle: navLabel,
  });
}

export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;

  // Optional: a Builder-authored page has no bundled envelope at all (see
  // generateStaticParams). Its layout comes entirely from WordPress, which
  // is already this route's preferred source below — the envelope only ever
  // supplied a fallback `blocks` and the nav highlight.
  const data: { navKey: string; blocks: any[] } | undefined = BLOCK_PAGES[page];

  // The Visual Builder writes layout into WordPress (see wordpress/
  // mu-plugins/acf-fields.php's group_page_layout + lib/cms.ts's
  // parseBlocks) — prefer it over the static content/*.json this page was
  // originally seeded from. Falls back to the repo JSON for one release
  // after the seed migration (wordpress/seed-orst-layout.mjs) in case a
  // deployment hasn't been migrated yet or WordPress is unreachable at
  // build time; delete this fallback once every environment is confirmed
  // migrated. `data.navKey` (route chrome, not layout) always comes from
  // the static envelope regardless of where blocks came from.
  const wpPage = await getWpPage("orst", page);
  if (!wpPage?.blocks?.length) {
    console.warn(`[orst/${page}] no WordPress-authored blocks — falling back to static content/${page}.json`);
  }
  // Neither source has anything to render: not a real page on this tenant.
  if (!wpPage?.blocks?.length && !data) return notFound();
  let blocks = wpPage?.blocks?.length ? wpPage.blocks : data!.blocks;

  // Every block whose id used to be hardcoded here (online-services, media,
  // journals, highlight, announcements, mission, structure, transparency,
  // dictionary's services/faq) now carries its own `source` binding, seeded
  // by wordpress/seed-orst-sources.mjs — see lib/blockSource.ts. One
  // generic pass replaces what used to be a per-page if/else chain, and
  // means a block can be renamed, duplicated, or moved to a different page
  // in the Builder without silently losing its live content.
  blocks = await resolveSources(blocks, "orst");

  if (page === "about") {
    // Real narrative from wp:page slug "about" (sourced from the RoyalSociety
    // sister-design's About page — ORST's own about.json content was an
    // unfilled placeholder). RichText already supports raw HTML via `b.html`
    // (see Blocks.tsx), so just hand it the fetched content directly instead
    // of the static `paragraphs` placeholders — leave the block untouched
    // (bracketed placeholders and all) if the page hasn't been seeded yet.
    // wpPage (fetched above, for the page's own layout) IS this page's own
    // "about" WordPress post — reuse it instead of a second identical fetch.
    //
    // "overview" and "at-a-glance" stay bespoke (not a `source` binding):
    // overview pulls a single field (this page's OWN content), not a list;
    // at-a-glance aggregates across TWO different feeds (timeline + org
    // units) into synthetic values no generic per-block source can express.
    if (wpPage?.content) {
      blocks = withFields(blocks, "overview", { html: wpPage.content });
    }

    // The "at-a-glance" facts are a summary of data already live on this
    // page (founding year and current-law year are the timeline's earliest/
    // latest entries; bureau count is org-units' length; member count is
    // the new wp:member directory's length — see components/
    // MemberDirectory.tsx's own comment for why that field was previously
    // an unfilled "[จำนวน]" placeholder) — derived rather than hand-authored
    // numbers, so they can never drift out of sync with what they summarize.
    // orgUnits is fetched again here (resolveSources already fetched it
    // once for "structure") purely for its .length — see the import
    // comment above for why that small duplication is acceptable.
    const [orgUnits, timeline, members] = await Promise.all([getWpOrgUnits("orst"), getWpTimeline("orst"), getWpMembers("orst")]);
    blocks = withFields(blocks, "at-a-glance", { lead: "ข้อมูล ณ ปัจจุบัน" });
    if (timeline.length && orgUnits.length) {
      blocks = withFields(blocks, "at-a-glance", {
        items: [
          { value: timeline[0].acf?.year || "", label: "ปีที่ก่อตั้ง", note: "สถาปนา" },
          { value: timeline[timeline.length - 1].acf?.year || "", label: "พระราชบัญญัติฉบับปัจจุบัน", note: "กฎหมายปัจจุบัน" },
          { value: orgUnits.length + " สำนัก", label: "สำนักวิชาการ", note: "โครงสร้างวิชาการ" },
          ...(members.length ? [{ value: members.length + " ท่าน", label: "ราชบัณฑิตและภาคีสมาชิก", note: "รายชื่อทั้งหมด" }] : []),
        ],
      });
    }
  }

  if (page === "careers") {
    // Real job/application e-forms (TOR gap audit) — see lib/cms.ts's
    // getJobs and components/JobApplicationForm.tsx's own comments. `job` is
    // a cross-engine Strapi type (like tenant/menu-item), so this fetches
    // straight from Strapi rather than through resolveSources' WP-only
    // fetchers.
    const jobs = await getJobs("orst");
    blocks = withFields(blocks, "job-listing", { jobs });
  }

  const [tenant, navItems] = await Promise.all([getTenant("orst"), getNavItems("orst")]);

  const customIcons = await getCustomIcons("orst");
  return (
    <>
      <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <Header active={data?.navKey ?? page} navItems={navItems} />
      <main id="main-content">
        <div id="app-content">
          <Blocks blocks={blocks} customIcons={customIcons} />
        </div>
      </main>
      <Footer tenant={tenant} />
    </>
  );
}
