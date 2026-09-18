// Fetches an arbitrary webpage and extracts a title + content + (best-effort)
// a representative image — for import_url_page (lib/agent/tools.ts, "build a
// page from a link"). Deliberately NOT a real readability engine (no
// @mozilla/readability/jsdom dependency): a regex strip of the obvious noise
// tags plus sanitize-html's own tag allowlist is good enough for reasonably
// well-structured pages (blogs, docs, gov sites) without pulling in a DOM
// implementation for a narrow, best-effort need — messy/JS-heavy pages will
// extract poorly, which is an accepted limitation, not a bug to chase here.
import "server-only";
import { safeFetch, readCapped, resolveBackgroundImageFromUrl, MAX_HTML_BYTES } from "./urlImage";
import { sanitizeContentHtml, htmlToParagraphs } from "./htmlText";
import type { ImportedPageContent } from "./wordpressImport";
import { CmsError } from "@/lib/cms/types";

const NOISE_TAGS = /<(script|style|nav|header|footer|noscript|svg|form|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;

function extractTitle(html: string): string {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og) return og[1].trim();
  const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return t ? t[1].trim() : "";
}

/** A page's title, its content in both shapes the two engines' blocks accept
 * (see htmlText.ts), and a representative image URL if one is findable.
 * Throws a CmsError for anything private, unreachable, or with no usable
 * content, same posture as urlImage.ts's own resolveBackgroundImageFromUrl. */
export async function fetchUrlPageContent(pageUrl: string): Promise<ImportedPageContent> {
  let parsed: URL;
  try { parsed = new URL(pageUrl); } catch { throw new CmsError(`"${pageUrl}" is not a valid URL.`, 400); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new CmsError("Only http(s) URLs are allowed.", 400);

  let r: Response;
  try { r = await safeFetch(pageUrl, "text/html"); }
  catch (err) { throw new CmsError(`Could not reach "${pageUrl}": ${err instanceof Error ? err.message : "network error"}`, 400); }
  if (!r.ok) throw new CmsError(`"${pageUrl}" returned HTTP ${r.status}.`, 400);
  const contentType = r.headers.get("content-type") || "";
  if (!contentType.includes("html")) throw new CmsError(`"${pageUrl}" is not an HTML page (content-type: ${contentType || "unknown"}).`, 400);

  const html = await readCapped(r, MAX_HTML_BYTES);
  const title = extractTitle(html) || pageUrl;
  const stripped = html.replace(NOISE_TAGS, " ");
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(stripped);
  // Relative URLs (href/src) are left as-is rather than resolved against
  // pageUrl — an imported <img src="/logo.png"> pointing back at the SOURCE
  // site is a cosmetic gap (broken image), not a security one; resolving
  // them well would need the same base-URL handling every attribute goes
  // through, not worth it for a best-effort extraction.
  const bodyHtml = sanitizeContentHtml(bodyMatch ? bodyMatch[1] : stripped);
  if (!bodyHtml) throw new CmsError(`Couldn't find any readable content on "${pageUrl}".`, 400);

  // A representative image is a nice-to-have, not required — don't fail the
  // whole import just because this page has no og:image (resolveBackgroundImageFromUrl
  // throws in that case, by design, for set_block_background_image's stricter need).
  let imageUrl: string | null = null;
  try { imageUrl = await resolveBackgroundImageFromUrl(pageUrl); } catch { /* no usable image — fine */ }

  return { title, bodyHtml, paragraphs: htmlToParagraphs(bodyHtml), imageUrl };
}
