import { getWpNews, getTenant } from "@/lib/cms";
import { buildRss } from "@/lib/rss";

// `output: "export"` needs Route Handlers to opt into static generation
// explicitly — unlike page routes, it isn't inferred automatically.
export const dynamic = "force-static";

// listingPath is /royalsociety/activities, not a dedicated /news page —
// RoyalSociety has no such route (see app/royalsociety/[page]/page.tsx's
// BLOCK_PAGES); "activities" is the closest existing page to a news/
// announcements listing.
export async function GET() {
  const [entries, tenant] = await Promise.all([getWpNews("royalsociety"), getTenant("royalsociety")]);
  const siteName = tenant?.brand?.orgName?.th || tenant?.name || "ราชบัณฑิตยสภา";
  const xml = buildRss({
    tenant: "royalsociety",
    siteName: `ข่าวสารและกิจกรรม — ${siteName}`,
    description: "ข่าวสารและกิจกรรมล่าสุดจากราชบัณฑิตยสภา",
    listingPath: "/royalsociety/activities",
    entries,
  });
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
