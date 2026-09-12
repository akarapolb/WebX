"use client";
// Sanitizes CMS-authored HTML before it reaches dangerouslySetInnerHTML in
// the Visual Builder's editor preview and read-only block preview. Found in
// a full-codebase audit (2026-09-12): no sanitizer existed anywhere in
// either app's rendering chain. Here specifically, injected script runs
// same-origin as whoever opens the page/review in the Builder — a real
// privilege-escalation path (it can drive an authenticated fetch() to mint
// an API token or reassign a custom role), not just a cosmetic bug.
// public-site has its own copy (public-site/lib/sanitize.ts, same
// allowlist, different library — sanitize-html there since its rendering
// happens at build time in Node, DOMPurify here since every call site in
// this app is a client component running in the browser).
//
// NOT used by EmbedBlock-equivalent components — those deliberately
// execute admin-authored <script> content by design (gated by governance.ts's
// embedCode custom-role permission instead of output sanitization).
import DOMPurify from "dompurify";

// Next.js still renders "use client" components once server-side (Node) for
// the initial SSR pass before hydration. dompurify's Node-resolved export
// isn't the same bound, ready-to-use instance the browser gets — calling
// `.addHook`/`.sanitize` on it at module scope in that context threw
// "addHook is not a function" and crashed the whole page (confirmed live:
// /builder 500'd). Lazily create and cache the real instance only when a
// `window` actually exists; on the server, sanitizeCmsHtml below returns ""
// rather than ever emitting unsanitized HTML — the client re-renders with
// the real sanitized content on hydration a moment later. These call sites
// are all inside the authenticated admin Builder/preview UI, never a
// public/SEO'd page, so a blank first server-paint has no real cost.
let purify: typeof DOMPurify | null = null;
function getPurify(): typeof DOMPurify | null {
  if (typeof window === "undefined") return null;
  if (!purify) {
    purify = DOMPurify;
    // DOMPurify's ALLOWED_ATTR only checks attribute NAMES, not values —
    // allowing `style` globally (for custom block templates' own inline
    // styling) also lets a CSS-based script vector through unfiltered:
    // `style="background:url(javascript:alert(1))"` survived testing during
    // the same audit this sanitizer was added for (public-site's own copy
    // hit the identical gap — see its own comment). Largely dead in current
    // browsers, but cheap to close outright.
    purify.addHook("uponSanitizeAttribute", (_node, data) => {
      if (data.attrName === "style" && /javascript:|expression\s*\(|-moz-binding|behavior\s*:|@import/i.test(data.attrValue)) {
        data.keepAttr = false;
      }
    });
  }
  return purify;
}

const ALLOWED_TAGS = [
  "p", "br", "hr", "span", "div", "button",
  "section", "article", "header", "footer", "nav", "main",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "small",
  "ul", "ol", "li", "dl", "dt", "dd",
  "a", "img", "figure", "figcaption",
  "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "th", "td",
  // Static shape-drawing tags only — no "use"/"symbol" (SVG's own
  // resource-reference tags), same reasoning as public-site's copy.
  "svg", "path", "circle", "rect", "line", "polygon", "polyline", "g",
];

const ALLOWED_ATTR = [
  "href", "title", "target", "rel",
  "src", "alt", "width", "height",
  "class", "id", "style",
  "viewbox", "fill", "xmlns", "aria-hidden", "d", "stroke", "stroke-width",
];

export function sanitizeCmsHtml(html: unknown): string {
  if (typeof html !== "string" || !html) return "";
  const p = getPurify();
  if (!p) return ""; // server-side render pass — see getPurify's own comment
  // DOMPurify's own default ALLOWED_URI_REGEXP already blocks javascript:/
  // data: etc. while allowing relative URLs and http(s)/mailto/tel — no
  // need to override it.
  return p.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

/** JSON.stringify() does not escape "<", so a CMS-authored string in the
 * JSON-LD payload containing a literal "</script>" breaks out of the
 * <script type="application/ld+json"> tag it's rendered into. Same fix as
 * public-site's jsonForScript. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
