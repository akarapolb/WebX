// RSS 2.0 feed builder (TOR gap audit — no feed producer existed anywhere).
// Shared by app/orst/feed.xml/route.ts and app/royalsociety/feed.xml/
// route.ts. Server-only (Route Handlers only run server-side).
import type { WpEntry } from "./cms";
import { siteUrlFor, publicPath } from "./seo";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildRss(opts: {
  tenant: string;
  siteName: string;
  description: string;
  /** Every item links here — there's no per-article detail page anywhere
   * in this site (news/publications/etc. are card listings, not
   * individually routed), so the honest destination for "read more" on
   * any one entry is the listing page itself, not a URL that doesn't
   * exist. */
  listingPath: string;
  entries: WpEntry[];
}): string {
  const base = siteUrlFor(opts.tenant);
  const channelLink = `${base}${publicPath(opts.tenant, opts.listingPath)}`;
  const feedUrl = `${base}${publicPath(opts.tenant, `/${opts.tenant}/feed.xml`)}`;
  const items = opts.entries
    .map((e) => {
      const pubDate = e.date ? new Date(e.date).toUTCString() : "";
      return `    <item>
      <title>${escapeXml(e.title)}</title>
      <link>${escapeXml(channelLink)}</link>
      <guid isPermaLink="false">${opts.tenant}-post-${e.id}</guid>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}
      <description>${escapeXml(e.excerpt || "")}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(opts.siteName)}</title>
    <link>${escapeXml(channelLink)}</link>
    <description>${escapeXml(opts.description)}</description>
    <language>th</language>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
