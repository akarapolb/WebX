import { notFound } from "next/navigation";
import Header from "@/templates/royalsociety/Header";
import Footer from "@/templates/royalsociety/Footer";
import Blocks from "@/templates/royalsociety/Blocks";
import aboutData from "@/templates/royalsociety/content/about.json";
import knowledgeData from "@/templates/royalsociety/content/knowledge.json";
import activitiesData from "@/templates/royalsociety/content/activities.json";
import publicationsData from "@/templates/royalsociety/content/publications.json";
import servicesData from "@/templates/royalsociety/content/services.json";
import contactData from "@/templates/royalsociety/content/contact.json";
import careersData from "@/templates/royalsociety/content/careers.json";
import { getWpPage, getWpTimeline, getWpOrgUnits, getJobs, getTenant, getNavItems, listWpPageSlugs } from "@/lib/cms";
import { resolveSources } from "@/lib/blockSource";
import { pageMetadata } from "@/lib/seo";

// The 6 JSON-block-driven inner pages (rendered via templates/royalsociety/
// Blocks.tsx) — full decomposition of AboutPage.tsx/KnowledgePage.tsx/
// ActivitiesPage.tsx/PublicationsPage.tsx/ServicesPage.tsx/ContactPage.tsx,
// same "RoyalSociety parity" phase as app/royalsociety/page.tsx. Those files
// and this route's old per-page branches are gone — no hand-written
// RoyalSociety content pages remain.
const BLOCK_PAGES: Record<string, { navKey: string; blocks: any[] }> = {
  about: aboutData as any,
  knowledge: knowledgeData as any,
  activities: activitiesData as any,
  publications: publicationsData as any,
  services: servicesData as any,
  contact: contactData as any,
  careers: careersData as any,
};

/** Merge arbitrary field overrides into one block by id — see app/orst/
 * [page]/page.tsx's identical helper for why this doesn't fit `source`. */
function withFields(blocks: any[], blockId: string, fields: Record<string, any>): any[] {
  return blocks.map((b) => (b.id === blockId ? { ...b, ...fields } : b));
}

// Union of the pages this route was seeded with (each bundling a
// content/*.json envelope) and whatever else exists in WordPress for this
// tenant — without the second half, a page created in the Visual Builder has
// no route at all. Same reasoning as the ORST route's own copy.
export async function generateStaticParams() {
  const authored = await listWpPageSlugs("royalsociety");
  return [...new Set([...Object.keys(BLOCK_PAGES), ...authored])].map((page) => ({ page }));
}

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (!BLOCK_PAGES[page]) return {};
  const [wpPage, tenant, navItems] = await Promise.all([getWpPage("royalsociety", page), getTenant("royalsociety"), getNavItems("royalsociety")]);
  const navLabel = navItems.find((n) => n.url === "/royalsociety/" + page)?.label || page;
  return pageMetadata({
    tenant: "royalsociety", tenantData: tenant, path: "/royalsociety/" + page,
    title: wpPage?.title, description: wpPage?.excerpt, imageUrl: wpPage?.imageUrl,
    fallbackTitle: navLabel,
  });
}

export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  // Optional: a Builder-authored page has no bundled envelope (see
  // generateStaticParams). Its layout comes from WordPress, already this
  // route's preferred source below — the envelope only ever supplied a
  // fallback `blocks` and the nav highlight.
  const data: { navKey: string; blocks: any[] } | undefined = BLOCK_PAGES[page];

  // Prefer WordPress-authored blocks (the Visual Builder's own write path)
  // over the static content/*.json this page was seeded from — see
  // app/orst/[page]/page.tsx's identical comment for the one-release
  // fallback window and wordpress/seed-royalsociety-layout.mjs for the
  // migration.
  const wpPage = await getWpPage("royalsociety", page);
  if (!wpPage?.blocks?.length) {
    console.warn(`[royalsociety/${page}] no WordPress-authored blocks — falling back to static content/${page}.json`);
  }
  // Neither source has anything to render: not a real page on this tenant.
  if (!wpPage?.blocks?.length && !data) return notFound();
  let blocks = wpPage?.blocks?.length ? wpPage.blocks : data!.blocks;

  // Every block whose id used to be hardcoded here (databases, articles,
  // activities, publications, services, faq, timeline, mission, structure)
  // now carries its own `source` binding — see lib/blockSource.ts.
  blocks = await resolveSources(blocks, "royalsociety");

  if (page === "about") {
    // Real narrative from wp:page slug "about" (this page's own WordPress
    // post) — same bespoke merge as ORST AboutPage's "overview" block, same
    // trust boundary (server-seeded rich-text HTML, not Builder-editable).
    if (wpPage?.content) {
      blocks = withFields(blocks, "about-intro", { html: wpPage.content });
    }

    // "founded"/"currentLaw"/"bureauCount" summarize data the timeline/
    // structure blocks already carry (earliest timeline year, this page's
    // own org-unit count) — derived rather than hand-authored, so it can
    // never drift out of sync with them. Same pattern as ORST AboutPage's
    // "at-a-glance" facts.
    const [timeline, orgUnits] = await Promise.all([getWpTimeline("royalsociety"), getWpOrgUnits("royalsociety")]);
    if (timeline.length) {
      blocks = withFields(blocks, "about-hero", { founded: timeline[0].acf?.year || undefined });
    }
    // Same convention as app/orst/[page]/page.tsx's identical "at-a-glance"
    // merge: the LAST chronological timeline entry is the current law, not
    // a keyword search. (An earlier version of this file used a regex
    // `.find()` for "กฎหมาย|พ.ร.บ|พระราชบัญญัติ" — wrong whenever more than
    // one entry matches, since `.find()` returns the FIRST match: verified
    // live, it showed a 1933 act's year instead of the 2015 act that's
    // actually in force today. Timeline entries are titled inconsistently
    // enough — not every one names the founding act — that matching on
    // position, like ORST does, is more reliable than matching on wording.)
    if (timeline.length) {
      blocks = withFields(blocks, "about-hero", { currentLaw: timeline[timeline.length - 1].acf?.year || undefined });
    }
    if (orgUnits.length) {
      blocks = withFields(blocks, "about-hero", { bureauCount: orgUnits.length + " สำนัก" });
    }
  }

  if (page === "careers") {
    // Real job/application e-forms (TOR gap audit) — see app/orst/[page]/
    // page.tsx's identical branch for the full reasoning.
    const jobs = await getJobs("royalsociety");
    blocks = withFields(blocks, "job-listing", { jobs });
  }

  const [tenant, navItems] = await Promise.all([getTenant("royalsociety"), getNavItems("royalsociety")]);

  if (page === "contact" && tenant?.contact) {
    // Keeps this page's office panel from silently drifting out of sync
    // with Footer's own tenant-sourced contact info — same reasoning
    // ContactPage.tsx's own file comment gave for taking the `tenant` prop
    // before this page was decomposed into blocks.
    blocks = withFields(blocks, "contact-office", {
      address: tenant.contact.address?.th || undefined,
      phone: tenant.contact.phone || undefined,
      email: tenant.contact.email || undefined,
    });
  }

  return (
    <>
      <Header active={data?.navKey ?? page} navItems={navItems} />
      <main id="main-content">
        <div id="app-content">
          <Blocks blocks={blocks} />
        </div>
      </main>
      <Footer tenant={tenant} />
    </>
  );
}
