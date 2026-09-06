import { getWpNews, getTenant } from "@/lib/cms";
import { buildRss } from "@/lib/rss";

// `output: "export"` needs Route Handlers to opt into static generation
// explicitly — unlike page routes, it isn't inferred automatically.
export const dynamic = "force-static";

export async function GET() {
  const [entries, tenant] = await Promise.all([getWpNews("orst"), getTenant("orst")]);
  const siteName = tenant?.brand?.orgName?.th || tenant?.name || "สำนักงานราชบัณฑิตยสภา";
  const xml = buildRss({
    tenant: "orst",
    siteName: `ข่าวสารและกิจกรรม — ${siteName}`,
    description: "ข่าวประชาสัมพันธ์ ประกาศ และความเคลื่อนไหวล่าสุดจากสำนักงานราชบัณฑิตยสภา",
    listingPath: "/orst/news",
    entries,
  });
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
