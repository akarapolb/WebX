// Sanitizes CMS-authored HTML before it reaches dangerouslySetInnerHTML.
// Found in a full-codebase audit (2026-09-12): no sanitizer existed anywhere
// in this app's rendering chain — every rich-text/custom-block-template
// field flowed straight from Strapi/WordPress into the DOM unescaped. A
// content editor is a semi-trusted actor, but this is still the single
// biggest stored-XSS surface against citizens visiting these government
// sites (one over-permissioned custom role, or one compromised editor
// account, becomes site-wide script execution with no second layer of
// defense). Applied at every actual dangerouslySetInnerHTML call site for
// genuine CMS body/rich-text/custom-block content — NOT at EmbedBlock,
// which deliberately executes admin-authored <script> content by design
// (gated server-side by governance.ts's embedCode permission instead).
import sanitizeHtml from "sanitize-html";

// Two of the thirteen call sites this is used from are custom BLOCK
// TEMPLATES (block-type.template — "HTML template, use {{key}} for field
// values" per its own schema comment), a deliberately open-ended "build
// your own block design" feature, not just prose rich text — so the
// allowlist below is generous with structural/layout tags (button,
// section/article/header/footer/nav, basic SVG for inline icons, `style`/
// `id` attributes) rather than a narrow prose-only set. What's blocked is
// unconditional regardless of use case: script, iframe, object/embed, form
// submission, every `on*` handler, and any javascript:/data: URL.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "span", "div", "button",
    "section", "article", "header", "footer", "nav", "main",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "small",
    "ul", "ol", "li", "dl", "dt", "dd",
    "a", "img", "figure", "figcaption",
    "blockquote", "pre", "code",
    "table", "thead", "tbody", "tr", "th", "td",
    // Static shape-drawing tags only — deliberately NOT "use"/"symbol"
    // (SVG's own resource-reference tags, historically a real XSS vector
    // when they can point at an external/data: URL) since inline icons in
    // this codebase already go through <img> (see AnyIcon in
    // BlockRenderer.tsx), not sprite references.
    "svg", "path", "circle", "rect", "line", "polygon", "polyline", "g",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    svg: ["viewbox", "width", "height", "fill", "xmlns", "aria-hidden"],
    path: ["d", "fill", "stroke", "stroke-width"],
    "*": ["class", "id", "style"],
  },
  // Only http(s)/mailto/tel/relative links — blocks javascript:/data: etc.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  // A crafted href like "  javascript:..." (leading whitespace/control
  // chars) can slip past some naive scheme checks — this library already
  // guards against that internally, but transformTags below adds a second,
  // independent belt-and-suspenders check on every anchor's own href.
  transformTags: {
    a: (tagName, attribs) => {
      const href = String(attribs.href || "");
      if (/^\s*javascript:/i.test(href)) delete attribs.href;
      // External links open safely — same convention already used
      // elsewhere in this app for hrefs the CMS doesn't fully control.
      if (attribs.target === "_blank") attribs.rel = "noopener noreferrer";
      return { tagName, attribs };
    },
    // sanitize-html's allowedAttributes only checks attribute NAMES, not
    // values — allowing `style` globally (for custom block templates' own
    // inline styling) also let a CSS-based script vector through
    // unfiltered: `style="background:url(javascript:alert(1))"` survived
    // testing during the same audit this sanitizer was added for. Largely
    // dead in current browsers (modern engines don't execute javascript:
    // from CSS url()), but cheap to close outright rather than leave a
    // known-bad value sitting in a hardened allowlist.
    "*": (tagName, attribs) => {
      if (attribs.style && /javascript:|expression\s*\(|-moz-binding|behavior\s*:|@import/i.test(attribs.style)) {
        delete attribs.style;
      }
      return { tagName, attribs };
    },
  },
  disallowedTagsMode: "discard",
};

export function sanitizeCmsHtml(html: unknown): string {
  if (typeof html !== "string" || !html) return "";
  return sanitizeHtml(html, OPTIONS);
}

/** JSON.stringify() does not escape "<", so a CMS-authored string (e.g. an
 * FAQ answer) containing a literal "</script>" breaks out of a
 * `<script type="application/ld+json">` tag and lets an attacker-controlled
 * sibling tag execute — a well-known JSON-in-HTML injection vector, found
 * live in FaqBlock.tsx/Faqs.tsx's JSON-LD output during the same audit that
 * added sanitizeCmsHtml above. Use for any JSON.stringify() output going
 * into dangerouslySetInnerHTML inside a <script> tag. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
