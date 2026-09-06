import { getWpEvents } from "@/lib/cms";
import { toCalendarItems } from "@/lib/blockSource";
import { buildVCalendar } from "@/lib/ics";
import { siteUrlFor } from "@/lib/seo";

// `output: "export"` needs Route Handlers to opt into static generation
// explicitly — same requirement found live building app/orst/feed.xml.
export const dynamic = "force-static";

export async function GET() {
  const items = toCalendarItems(await getWpEvents("orst"));
  const ics = buildVCalendar(items, {
    calName: "ปฏิทินกิจกรรม — สำนักงานราชบัณฑิตยสภา",
    uidDomain: siteUrlFor("orst").replace(/^https?:\/\//, ""),
  });
  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="orst-events.ics"' },
  });
}
