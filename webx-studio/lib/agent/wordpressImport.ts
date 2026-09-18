// Fetches one page's content from a WordPress site's public REST API — for
// import_wordpress_page (lib/agent/tools.ts, "build a page from WordPress
// content"). Works identically for an external WP site or WebX's own
// WordPress-engine tenants (orst/royalsociety): both are ordinary public WP
// REST APIs, reads are unauthenticated by design either way (see
// wordpress/mu-plugins/custom-role-enforcement.php's own header comment —
// "Reads are deliberately... fetched unauthenticated"), so one fetch path
// serves both sources; the caller just supplies a different `siteUrl`.
import "server-only";
import { safeFetch, readCapped, MAX_HTML_BYTES } from "./urlImage";
import { sanitizeContentHtml, htmlToParagraphs } from "./htmlText";
import { CmsError } from "@/lib/cms/types";
import { WORDPRESS_URL } from "@/lib/config";

export type ImportedPageContent = {
  title: string;
  /** Sanitized HTML — for gov-portal's `block.richtext` body. */
  bodyHtml: string;
  /** The same content as plain strings — for orst/royalsociety's
   * `paragraphs`-style fields, which take no raw HTML. */
  paragraphs: string[];
  imageUrl: string | null;
};

/** Whether `url` shares an origin with this server's OWN configured
 * WORDPRESS_URL — that's operator config, not something a chat prompt
 * controls, so it isn't the SSRF shape safeFetch's private-address check
 * exists to close (see urlImage.ts's own comment on `skipHostCheck`).
 * Every OTHER siteUrl — any external site, or a private address someone
 * tries to pass off as "internal" — still goes through the full check via
 * safeFetch itself. This is what lets "import from our own orst content"
 * work in local dev (WORDPRESS_URL is a docker-internal host/localhost
 * there) without weakening the guard for genuinely agent/human-supplied
 * URLs. Pure (no DNS lookup) — safe to call before any network access. */
function isOwnWordpress(url: string): boolean {
  try { return new URL(url).origin === new URL(WORDPRESS_URL).origin; } catch { return false; }
}

async function fetchJson(url: string): Promise<any> {
  let r: Response;
  try { r = await safeFetch(url, "application/json", { skipHostCheck: isOwnWordpress(url) }); }
  catch (err) { throw new CmsError(`Could not reach "${url}": ${err instanceof Error ? err.message : "network error"}`, 400); }
  if (!r.ok) throw new CmsError(`"${url}" returned HTTP ${r.status}.`, 400);
  const text = await readCapped(r, MAX_HTML_BYTES);
  try { return JSON.parse(text); } catch { throw new CmsError(`"${url}" did not return valid JSON — is this really a WordPress REST API?`, 400); }
}

// A page built in WebX's OWN Visual Builder stores nothing in WordPress's
// native post content — its real content lives in the `blocks` ACF field as
// this app's own block JSON (found live: orst-about's content.rendered is
// empty while acf.blocks holds the whole page). Pull the human-readable
// strings out of that instead, so importing from an orst/royalsociety page
// isn't a dead end. Deliberately shallow: every string value a block carries,
// in order, not a faithful block-for-block translation — the model is
// rebuilding the page out of the DESTINATION dialect's own blocks anyway, so
// what it needs from here is the copy, not the source layout.
const SKIP_KEYS = new Set(["id", "type", "comp", "__component", "href", "url", "icon", "variant", "image", "imageAlt", "columns", "style", "size", "tag", "meta"]);
function stringsFromAcfBlocks(blocks: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "string") {
      const s = v.replace(/\s+/g, " ").trim();
      if (s.length > 1 && !(key && SKIP_KEYS.has(key)) && !/^https?:\/\//i.test(s) && !s.startsWith("#")) out.push(s);
      return;
    }
    if (Array.isArray(v)) { v.forEach((x) => walk(x)); return; }
    if (v && typeof v === "object") { for (const [k, vv] of Object.entries(v as Record<string, unknown>)) walk(vv, k); }
  };
  let parsed: unknown = blocks;
  if (typeof blocks === "string") { try { parsed = JSON.parse(blocks); } catch { return []; } }
  walk(parsed);
  return out;
}

/** `siteUrl` is a WordPress REST API base, the same shape as this app's own
 * WORDPRESS_URL config (e.g. "http://localhost:8081/wp-json" or
 * "https://example.gov.th/wp-json") — NOT a page's own permalink; `slug` is
 * the page's own slug (e.g. "about-us"), the part after the domain on its
 * real URL. */
export async function fetchWordpressPage(siteUrl: string, slug: string): Promise<ImportedPageContent> {
  let base: URL;
  try { base = new URL(siteUrl); } catch { throw new CmsError(`"${siteUrl}" is not a valid URL.`, 400); }
  if (base.protocol !== "http:" && base.protocol !== "https:") throw new CmsError("Only http(s) URLs are allowed.", 400);
  if (!slug.trim()) throw new CmsError("slug is required.", 400);

  const root = siteUrl.replace(/\/$/, "");
  const listUrl = `${root}/wp/v2/pages?slug=${encodeURIComponent(slug)}&_embed=wp:featuredmedia`;
  const rows = await fetchJson(listUrl);
  if (!Array.isArray(rows) || !rows.length) {
    throw new CmsError(`No published page with slug "${slug}" found at "${siteUrl}".`, 404);
  }
  const page = rows[0];
  const title: string = page?.title?.rendered || slug;
  const imageUrl: string | null = page?._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null;

  const rawHtml: string = page?.content?.rendered || "";
  if (rawHtml.trim()) {
    const bodyHtml = sanitizeContentHtml(rawHtml);
    if (bodyHtml) return { title, bodyHtml, paragraphs: htmlToParagraphs(bodyHtml), imageUrl };
  }

  // Native content empty → a WebX Visual Builder page (see stringsFromAcfBlocks).
  const fromBlocks = stringsFromAcfBlocks(page?.acf?.blocks);
  if (!fromBlocks.length) throw new CmsError(`The page "${slug}" at "${siteUrl}" has no readable content.`, 400);
  const paragraphs = fromBlocks.slice(0, 20);
  return {
    title,
    bodyHtml: sanitizeContentHtml(paragraphs.map((p) => `<p>${p.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))}</p>`).join("")),
    paragraphs,
    imageUrl,
  };
}
