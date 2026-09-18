// Resolves a human-pasted URL (a direct image link, or an ordinary webpage
// whose own og:image is used) into a real, fetchable image URL — for
// set_block_background_image (lib/agent/tools.ts). Deliberately NOT a full
// headless-browser render: reading one <head> meta tag off the page's own
// HTML is enough to source "this page's picture" without pulling in a
// browser-automation dependency for a narrow, agent-only need.
import "server-only";
import { assertIssuerHostIsPublic } from "@/lib/oidc";
import { CmsError } from "@/lib/cms/types";

export const MAX_HTML_BYTES = 2_000_000; // plenty for any real page's <head>, or a page's own body text
const FETCH_TIMEOUT_MS = 6000;
const MAX_IMAGE_BYTES = 8_000_000;

// Every fetch this module makes is server-side, against a URL a chat prompt
// (ultimately a human, but relayed through an LLM's own tool-call args) can
// fully control — the same SSRF shape lib/oidc.ts's assertIssuerHostIsPublic
// was written to close for tenant-supplied SSO issuer URLs (an admin pointing
// this server at an internal service/cloud metadata endpoint/localhost).
// Reused as-is here rather than re-implementing the same private-IP/DNS
// check a second time; the name is a holdover from that original call site.
// Exported for reuse by lib/agent/pageContent.ts (import_url_page) and
// lib/agent/wordpressImport.ts (import_wordpress_page) — same
// "fetch an arbitrary human/model-supplied URL safely" need, just a
// different thing done with the response afterward.
// `opts.skipHostCheck`: wordpressImport.ts's ONLY use of this — for a
// `siteUrl` already confirmed (by comparing origins against this server's
// OWN configured WORDPRESS_URL) to be operator config, not a human/model-
// controlled value, so the private-address check this function normally
// always runs would incorrectly block it (WORDPRESS_URL is a docker-
// internal hostname/localhost in local dev — see wordpressImport.ts's own
// header comment). Never pass this for a URL whose origin hasn't been
// verified that way; every other caller leaves it false.
export async function safeFetch(url: string, accept: string, opts: { skipHostCheck?: boolean } = {}): Promise<Response> {
  if (!opts.skipHostCheck) await assertIssuerHostIsPublic(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, redirect: "follow", headers: { Accept: accept, "User-Agent": "WebXAgent/1.0" } });
  } finally {
    clearTimeout(timer);
  }
}

export async function readCapped(r: Response, maxBytes: number): Promise<string> {
  const reader = r.body?.getReader();
  if (!reader) return await r.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const OG_IMAGE_RE = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
];

/** Returns a public, verified-as-an-image URL derived from `pageUrl` — the
 * URL itself if it's already an image, otherwise that page's own og:image/
 * twitter:image meta tag. Throws a CmsError (surfaced back to the model as
 * the tool's own failure) for anything private, unreachable, or with no
 * usable image, rather than guessing. */
export async function resolveBackgroundImageFromUrl(pageUrl: string): Promise<string> {
  let parsed: URL;
  try { parsed = new URL(pageUrl); } catch { throw new CmsError(`"${pageUrl}" is not a valid URL.`, 400); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new CmsError("Only http(s) URLs are allowed.", 400);

  let r: Response;
  try { r = await safeFetch(pageUrl, "text/html,image/*"); }
  catch (err) { throw new CmsError(`Could not reach "${pageUrl}": ${err instanceof Error ? err.message : "network error"}`, 400); }
  if (!r.ok) throw new CmsError(`"${pageUrl}" returned HTTP ${r.status}.`, 400);

  const contentType = r.headers.get("content-type") || "";
  let imageUrl: string;
  if (contentType.startsWith("image/")) {
    imageUrl = pageUrl;
  } else {
    const html = await readCapped(r, MAX_HTML_BYTES);
    const match = OG_IMAGE_RE.map((re) => re.exec(html)).find(Boolean);
    if (!match) throw new CmsError(`Couldn't find a usable image (og:image) on "${pageUrl}" — try a direct image link instead.`, 400);
    imageUrl = new URL(match[1], pageUrl).href;
  }

  // The extracted image URL is itself untrusted content (came from someone
  // else's page) — re-run the same public-host check before this server
  // ever fetches it, same as if a human had pasted it directly.
  let imgResp: Response;
  try { imgResp = await safeFetch(imageUrl, "image/*"); }
  catch (err) { throw new CmsError(`Could not fetch the image at "${imageUrl}": ${err instanceof Error ? err.message : "network error"}`, 400); }
  if (!imgResp.ok) throw new CmsError(`Image URL "${imageUrl}" returned HTTP ${imgResp.status}.`, 400);
  const imgType = imgResp.headers.get("content-type") || "";
  if (!imgType.startsWith("image/")) throw new CmsError(`"${imageUrl}" is not an image (content-type: ${imgType || "unknown"}).`, 400);
  const len = Number(imgResp.headers.get("content-length") || "0");
  if (len > MAX_IMAGE_BYTES) throw new CmsError("Image is too large (max 8MB).", 400);

  return imageUrl;
}
