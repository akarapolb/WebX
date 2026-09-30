import { notFound } from "next/navigation";
import Header from "@/templates/royalsociety/Header";
import Footer from "@/templates/royalsociety/Footer";
import Blocks from "@/templates/royalsociety/Blocks";
import aboutDataEn from "@/templates/royalsociety/content/en/about.json";
import contactDataEn from "@/templates/royalsociety/content/en/contact.json";
import servicesDataEn from "@/templates/royalsociety/content/en/services.json";
import { getWpPage, getWpTimeline, getWpOrgUnits, getTenant, getNavItems, getCustomIcons } from "@/lib/cms";
import { resolveSources } from "@/lib/blockSource";
import { pageMetadata } from "@/lib/seo";

// Bilingual EN (TOR gap) — English counterpart of
// app/royalsociety/[page]/page.tsx. Only 3 of the Thai route's 6 pages have
// a real English translation today (about/contact/services — home is the
// separate /en/royalsociety route); knowledge/activities/publications stay
// Thai-only, so this route doesn't generate them — see app/en/orst/
// [page]/page.tsx's identical comment for why that's the honest choice.
const BLOCK_PAGES: Record<string, { navKey: string; blocks: any[] }> = {
  about: aboutDataEn as any,
  contact: contactDataEn as any,
  services: servicesDataEn as any,
};

function withFields(blocks: any[], blockId: string, fields: Record<string, any>): any[] {
  return blocks.map((b) => (b.id === blockId ? { ...b, ...fields } : b));
}

export function generateStaticParams() {
  return Object.keys(BLOCK_PAGES).map((page) => ({ page }));
}

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const data = BLOCK_PAGES[page];
  if (!data) return {};
  const [tenant, navItems] = await Promise.all([getTenant("royalsociety"), getNavItems("royalsociety", "en")]);
  const navLabel = navItems.find((n) => n.url === "/royalsociety/" + page)?.label || page;
  return pageMetadata({
    tenant: "royalsociety", tenantData: tenant, path: "/en/royalsociety/" + page, locale: "en",
    title: (data as any).title, fallbackTitle: navLabel,
  });
}

export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const data = BLOCK_PAGES[page];
  if (!data) return notFound();

  const wpPage = await getWpPage("royalsociety", page);
  let blocks = wpPage?.blocksEn?.length ? wpPage.blocksEn : data.blocks;
  blocks = await resolveSources(blocks, "royalsociety", "en");

  if (page === "about") {
    // English counterpart of the Thai route's "founded"/"currentLaw"/
    // "bureauCount" merge — see app/royalsociety/[page]/page.tsx's
    // identical logic for why these are derived, not hand-authored.
    const [timeline, orgUnits] = await Promise.all([getWpTimeline("royalsociety"), getWpOrgUnits("royalsociety", "en")]);
    if (timeline.length) {
      blocks = withFields(blocks, "about-hero", { founded: timeline[0].acf?.year || undefined });
      blocks = withFields(blocks, "about-hero", { currentLaw: timeline[timeline.length - 1].acf?.year || undefined });
    }
    if (orgUnits.length) {
      blocks = withFields(blocks, "about-hero", { bureauCount: orgUnits.length + " bureaus" });
    }
  }

  const [tenant, navItems] = await Promise.all([getTenant("royalsociety"), getNavItems("royalsociety", "en")]);

  if (page === "contact" && tenant?.contact) {
    // English counterpart of the Thai route's identical contact-office
    // merge — falls back to the Thai address if no English one is seeded,
    // same convention as every other `_en` field in this feature.
    blocks = withFields(blocks, "contact-office", {
      address: tenant.contact.address?.en || tenant.contact.address?.th || undefined,
      phone: tenant.contact.phone || undefined,
      email: tenant.contact.email || undefined,
    });
  }

  const customIcons = await getCustomIcons("royalsociety");
  return (
    <>
      <Header active={data.navKey} navItems={navItems} locale="en" />
      <main id="main-content">
        <div id="app-content">
          <Blocks blocks={blocks} locale="en" customIcons={customIcons} />
        </div>
      </main>
      <Footer tenant={tenant} locale="en" />
    </>
  );
}
