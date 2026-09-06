// Generic "bind this block's items to a live WordPress feed" resolution —
// the ORST route's answer to gov-portal's block.collection-list. Moves what
// used to be app/orst/[page]/page.tsx's own hardcoded per-block-id
// withItems() calls into data the Visual Builder can edit (a `source`
// object on the block itself), so renaming or deleting a block no longer
// silently breaks its live content — the binding travels with the block.
//
// Not every merge in that route fits this shape and two deliberately don't:
// the "overview" block's `html` override (a single field pulled from the
// page's OWN WordPress post content, not a list) and "at-a-glance" (a
// cross-source aggregation — earliest/latest timeline year + org-unit count
// collapsed into 3 synthetic stat items). Both stay as bespoke page logic;
// see that file's own comments.
import {
  getWpServices, getWpPublications, getWpNews, getWpFaqs, getWpResources,
  getWpMissionItems, getWpOrgUnits, getWpDocuments, getWpTimeline, getWpEvents, getWpMembers, fmtDateTh, type WpEntry, type Locale,
} from "./cms";

export type SourcePostType = "service" | "publication" | "news" | "faq" | "resource" | "mission" | "org-unit" | "document" | "timeline" | "event" | "member";
export type SourceMap = "card" | "link" | "faq" | "mission" | "orgunit" | "document" | "timeline" | "dated" | "calendar" | "directory";
export type BlockSource = {
  kind: "wp";
  postType: SourcePostType;
  map: SourceMap;
  /** Icon-sprite id for the "card"/"link" mappers only — the others use a
   * fixed or per-entry icon (see their own mapper functions below). */
  icon?: string;
  /** Fixed tag override for the "card" mapper (e.g. news's "highlight"
   * block wants every card tagged "ข่าวประชาสัมพันธ์" regardless of the
   * post's own data). */
  tag?: string;
  limit?: number;
  offset?: number;
};

// Bilingual EN (TOR gap) — only service/faq/mission/org-unit/member carry
// `_en` ACF fields (see wordpress/mu-plugins/acf-fields.php's group_i18n_en
// and lib/cms.ts's localizeEntry); the rest ignore the extra `locale` arg
// and stay Thai-only regardless of which route calls them.
const FETCHERS: Record<SourcePostType, (tenant: string, locale?: Locale) => Promise<WpEntry[]>> = {
  service: getWpServices, publication: getWpPublications, news: getWpNews, faq: getWpFaqs,
  resource: getWpResources, mission: getWpMissionItems, "org-unit": getWpOrgUnits, document: getWpDocuments,
  timeline: getWpTimeline, event: getWpEvents, member: getWpMembers,
};

function toCardItems(entries: WpEntry[], icon: string, tag?: string): any[] {
  return entries.map((e) => ({ icon, title: e.title, body: e.excerpt, meta: fmtDateTh(e.date), href: "#", ...(tag ? { tag } : {}) }));
}
function toLinkItems(entries: WpEntry[], icon: string): any[] {
  return entries.map((e) => ({ icon, title: e.title, desc: e.excerpt, meta: fmtDateTh(e.date), href: "#" }));
}
function toFaqItems(entries: WpEntry[]): any[] {
  return entries.map((e) => ({ q: e.title, a: e.excerpt }));
}
// Verbatim ports of app/orst/[page]/page.tsx's former inline mappers for
// mission/org-unit/document — each reads ACF fields those WP post types
// carry that plain card/link items don't (icon, tag, fiscal_year, file_url).
function toMissionItems(entries: WpEntry[]): any[] {
  return entries.map((e) => ({ icon: e.acf?.icon || "i-service", title: e.title, body: e.excerpt }));
}
function toOrgUnitItems(entries: WpEntry[]): any[] {
  return entries.map((e) => ({ icon: "i-dictionary", title: e.title, body: e.excerpt, href: "#" }));
}
// Carries both ORST's link-list item shape (desc/meta) and RoyalSociety's
// list-panel shape (body/date) at once — the same WP document entries feed
// both templates' own existing block types, and each type just reads
// whichever pair of keys it already understands (an unused key is simply
// ignored, same as any other extra property on these plain item objects).
function toDocumentItems(entries: WpEntry[]): any[] {
  return entries.map((e) => {
    const desc = e.excerpt;
    const meta = e.acf?.fiscal_year || undefined;
    return {
      title: e.title, desc, body: desc, tag: e.acf?.tag || "PDF",
      meta, date: meta, href: e.acf?.file_url || "#",
    };
  });
}
// RoyalSociety's history-v2 timeline (AboutPage.tsx) — verbatim port of that
// component's own inline mapping (e.acf?.year/status_label), moved here so
// the "timeline" block type can bind to it like any other source instead of
// AboutPage.tsx's old bespoke prop-drilling.
function toTimelineItems(entries: WpEntry[]): any[] {
  return entries.map((e) => ({ year: e.acf?.year || "", statusLabel: e.acf?.status_label || "", title: e.title, body: e.excerpt || "" }));
}
// RoyalSociety's `.rs-list`/`.rs-list-item` dated lists (KnowledgePage's
// articles, ActivitiesPage's activities) — a "link" item plus a date, which
// the existing card/link mappers don't carry.
function toDatedItems(entries: WpEntry[]): any[] {
  return entries.map((e) => ({ date: fmtDateTh(e.date), tag: undefined, title: e.title, body: e.excerpt, href: "#" }));
}
// EventCalendar.tsx's own item shape — event_date/event_time/location/
// category are the group_event ACF fields (wordpress/mu-plugins/
// acf-fields.php); event_date stays a plain "Ymd" string (ACF's return
// format), not parsed into a Date here, since the calendar groups by exact
// string match against its own day cells anyway.
export type CalendarItem = { id: number; date: string; time?: string; location?: string; category?: string; title: string; body?: string };
export function toCalendarItems(entries: WpEntry[]): CalendarItem[] {
  return entries
    .filter((e) => e.acf?.event_date)
    .map((e) => ({
      id: e.id, date: String(e.acf?.event_date), time: e.acf?.event_time || undefined,
      location: e.acf?.location || undefined, category: e.acf?.category || undefined,
      title: e.title, body: e.excerpt || undefined,
    }));
}

// MemberDirectory.tsx's own item shape — tier/division are the group_member
// ACF fields (wordpress/mu-plugins/acf-fields.php); photo comes from the
// CPT's own featured-image (imageUrl), same as every other WP entry.
export type MemberItem = { id: number; name: string; photo: string | null; bio?: string; tier?: string; division?: string };
export function toMemberItems(entries: WpEntry[]): MemberItem[] {
  return entries.map((e) => ({
    id: e.id, name: e.title, photo: e.imageUrl, bio: e.excerpt || undefined,
    tier: e.acf?.tier || undefined, division: e.acf?.division || undefined,
  }));
}

const MAPPERS: Record<SourceMap, (entries: WpEntry[], src: BlockSource) => any[]> = {
  card: (entries, src) => toCardItems(entries, src.icon || "i-file", src.tag),
  link: (entries, src) => toLinkItems(entries, src.icon || "i-file"),
  faq: (entries) => toFaqItems(entries),
  mission: (entries) => toMissionItems(entries),
  orgunit: (entries) => toOrgUnitItems(entries),
  document: (entries) => toDocumentItems(entries),
  timeline: (entries) => toTimelineItems(entries),
  dated: (entries) => toDatedItems(entries),
  calendar: (entries) => toCalendarItems(entries),
  directory: (entries) => toMemberItems(entries),
};

/** Resolves every block's `source` binding (if any) into that block's
 * `items` array, in one pass. Fetches are de-duplicated per postType within
 * a single call — several blocks on one page can share the same feed (e.g.
 * publications' "media" and "journals" blocks both read wp:publication)
 * without re-fetching it twice. Blocks without a `source`, or whose
 * postType/map isn't recognized, pass through unchanged rather than
 * erroring — a malformed source shouldn't take down the whole page, just
 * leave that one block's items as whatever was already there (typically
 * empty, matching Blocks.tsx's own graceful-empty rendering). */
export async function resolveSources(blocks: any[], tenant: string, locale: Locale = "th"): Promise<any[]> {
  const cache = new Map<SourcePostType, Promise<WpEntry[]>>();
  const fetchFor = (postType: SourcePostType) => {
    if (!cache.has(postType)) cache.set(postType, FETCHERS[postType](tenant, locale));
    return cache.get(postType)!;
  };
  return Promise.all((blocks || []).map(async (b) => {
    const src: BlockSource | undefined = b?.source;
    if (!src || src.kind !== "wp") return b;
    const mapper = MAPPERS[src.map];
    if (!FETCHERS[src.postType] || !mapper) return b;
    let entries = await fetchFor(src.postType);
    if (src.offset) entries = entries.slice(src.offset);
    if (src.limit != null) entries = entries.slice(0, src.limit);
    return { ...b, items: mapper(entries, src) };
  }));
}
