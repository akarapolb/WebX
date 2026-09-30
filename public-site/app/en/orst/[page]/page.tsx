import { notFound } from "next/navigation";
import Header from "@/templates/orst/Header";
import Footer from "@/templates/orst/Footer";
import Blocks from "@/templates/orst/Blocks";
import aboutDataEn from "@/templates/orst/content/en/about.json";
import contactDataEn from "@/templates/orst/content/en/contact.json";
import servicesDataEn from "@/templates/orst/content/en/services.json";
import { getWpPage, getWpTimeline, getWpOrgUnits, getWpMembers, getTenant, getNavItems, getCustomIcons } from "@/lib/cms";
import { resolveSources } from "@/lib/blockSource";
import { pageMetadata } from "@/lib/seo";

// Bilingual EN (TOR gap) — English counterpart of app/orst/[page]/page.tsx.
// Only 3 of the Thai route's 7 pages have a real English translation today
// (about/contact/services — home is the separate /en/orst route); the rest
// (dictionary/news/publications/knowledge) stay Thai-only, so this route
// simply doesn't generate them — visiting /en/orst/news genuinely 404s
// rather than silently mixing languages or guessing at a translation that
// doesn't exist. Header.tsx's own TH/EN toggle already knows to keep a nav
// link to any of those pages on its Thai URL for exactly this reason.
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
  const [tenant, navItems] = await Promise.all([getTenant("orst"), getNavItems("orst", "en")]);
  const navLabel = navItems.find((n) => n.url === "/orst/" + page)?.label || page;
  return pageMetadata({
    tenant: "orst", tenantData: tenant, path: "/en/orst/" + page, locale: "en",
    title: (data as any).title, description: (data as any).description,
    fallbackTitle: navLabel,
  });
}

export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const data = BLOCK_PAGES[page];
  if (!data) return notFound();

  const wpPage = await getWpPage("orst", page);
  let blocks = wpPage?.blocksEn?.length ? wpPage.blocksEn : data.blocks;
  blocks = await resolveSources(blocks, "orst", "en");

  if (page === "about") {
    // English counterpart of the Thai route's "at-a-glance" merge — see
    // app/orst/[page]/page.tsx's identical logic for why these are derived
    // rather than hand-authored. wpPage.content (the WP "home"/"about"
    // page's own native content field) has no English variant, so unlike
    // the Thai route this doesn't override "overview" with live WP HTML —
    // the JSON's own translated overview paragraphs stand as authored.
    const [orgUnits, timeline, members] = await Promise.all([getWpOrgUnits("orst", "en"), getWpTimeline("orst"), getWpMembers("orst", "en")]);
    blocks = withFields(blocks, "at-a-glance", { lead: "As of today" });
    if (timeline.length && orgUnits.length) {
      blocks = withFields(blocks, "at-a-glance", {
        items: [
          { value: timeline[0].acf?.year || "", label: "Founding year", note: "Established" },
          { value: timeline[timeline.length - 1].acf?.year || "", label: "Current Act", note: "Current legislation" },
          { value: orgUnits.length + " bureaus", label: "Academic bureaus", note: "Academic structure" },
          ...(members.length ? [{ value: members.length + "", label: "Fellows & Associate Members", note: "Full roster" }] : []),
        ],
      });
    }
  }

  const [tenant, navItems] = await Promise.all([getTenant("orst"), getNavItems("orst", "en")]);

  const customIcons = await getCustomIcons("orst");
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
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
