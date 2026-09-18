// Shared HTML handling for the two import tools (wordpressImport.ts and
// pageContent.ts). Imported content has to reach BOTH engines' block
// vocabularies, which want it in two different shapes:
//   - gov-portal (Strapi tenants): `block.richtext`'s `body` — raw HTML.
//   - orst/royalsociety (WordPress tenants): `orst.rich-text`'s `paragraphs`
//     (and friends) — a plain, already-escaped string array. Those palettes
//     deliberately expose NO raw-html field at all (see blockCatalog.ts's own
//     comment above ORST_TYPES: exposing one would hand every Builder editor
//     a script-injection point on a live .go.th site).
// So every import returns both, and the model picks whichever its own
// dialect's blocks actually accept.
import "server-only";
import sanitizeHtml from "sanitize-html";

const CONTENT_TAGS = [
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "a", "img",
  "strong", "em", "b", "i", "blockquote", "br", "figure", "figcaption",
];
const SANITIZE_OPTS = { allowedTags: CONTENT_TAGS, allowedAttributes: { a: ["href"], img: ["src", "alt"] } };

// A landing-page-sized snippet, not "transclude the whole source page" —
// found live: importing a full Wikipedia article produced a body so long the
// model never finished passing it into insert_blocks within one run (real
// content, no truncation bug, just too large a single tool-call argument for
// one slice's turn/token budget).
const MAX_BODY_CHARS = 4000;
const MAX_PARAGRAPHS = 20;
const MAX_PARAGRAPH_CHARS = 600;

/** Sanitized to the content-tag allowlist and capped. Re-sanitizing the
 * truncated slice (rather than a bare String.slice) lets sanitize-html
 * re-close any tag the cut left dangling, instead of shipping malformed
 * HTML into a page. */
export function sanitizeContentHtml(html: string): string {
  const clean = sanitizeHtml(html, SANITIZE_OPTS).trim();
  return clean.length > MAX_BODY_CHARS ? sanitizeHtml(clean.slice(0, MAX_BODY_CHARS), SANITIZE_OPTS).trim() : clean;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
};
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[String(name).toLowerCase()] ?? m);
}

/** The same content as plain text, one entry per block-level element — the
 * shape orst/royalsociety's `paragraphs`-style scalar item lists take. Entity-
 * decoded (those fields are rendered escaped, so a literal "&amp;" would show
 * through as-is), de-duplicated of blank entries, and capped per entry and in
 * total for the same reason sanitizeContentHtml caps its own output. */
export function htmlToParagraphs(html: string): string[] {
  const withBreaks = html.replace(/<\/(p|h[1-6]|li|blockquote|figcaption|div)\s*>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  const text = decodeEntities(withBreaks.replace(/<[^>]*>/g, " "));
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 1)
    .map((line) => (line.length > MAX_PARAGRAPH_CHARS ? line.slice(0, MAX_PARAGRAPH_CHARS).trimEnd() + "…" : line))
    .slice(0, MAX_PARAGRAPHS);
}
