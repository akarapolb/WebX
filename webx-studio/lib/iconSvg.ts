// Hand-ported copy of public-site/lib/iconSvg.ts — the two packages do not
// import each other (same arrangement as blockPreview/blocks.tsx and
// public-site's BlockRenderer). Keep them identical: public-site's copy is the
// one that guards a real visitor, and its tests are the ones that prove the
// rules; this copy exists so the Builder can validate on save and render its
// own preview without shipping markup it would then reject.
//
// Inline SVG for a Visual-Builder icon — the security boundary for anything
// an editor imports or picks.
//
// An icon can now be stored as SVG markup rather than an uploaded image, so
// that picking one from the Material set (or importing a .svg) costs a page
// only the icon it actually uses, instead of growing the sprite that every
// page inlines. The markup reaches a public page through
// dangerouslySetInnerHTML, so it is never trusted: it arrives from an editor's
// file, and a stored record can also be changed through Strapi directly.
//
// Rather than trying to strip dangerous parts out of arbitrary SVG — an arms
// race against entity tricks, namespace aliases and nested foreignObject —
// this rebuilds the markup from scratch: only a fixed set of shape elements
// survive, each keeping only attributes from an allow-list, and every value is
// re-escaped on the way out. Anything unrecognised is dropped. An icon that
// loses a decorative flourish is a far better outcome than one that carries a
// <script>, an onload= or an xlink:href="javascript:…" onto a government page.

/** Elements that can draw an icon and cannot execute or load anything. */
const ALLOWED_TAGS = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "g", "defs", "clipPath", "title"]);

/** Presentation attributes only — no event handlers, no URLs, no styles. */
const ALLOWED_ATTRS = new Set([
  "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2",
  "width", "height", "points", "transform", "id",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
  "fill-rule", "clip-rule", "fill-opacity", "stroke-opacity", "opacity",
  "clip-path", "vector-effect",
]);

// React/JSX spells two of these in camelCase; both are accepted on input and
// normalised to the SVG attribute name.
const ATTR_ALIASES: Record<string, string> = {
  fillrule: "fill-rule", cliprule: "clip-rule", strokewidth: "stroke-width",
  strokelinecap: "stroke-linecap", strokelinejoin: "stroke-linejoin",
  fillopacity: "fill-opacity", strokeopacity: "stroke-opacity", clippath: "clip-path",
};

/** Values are re-emitted inside double quotes, so only these need escaping. */
const escAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escText = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A value is rejected outright if it could reference anything. `url(...)` is
 * allowed only in its local `url(#id)` form, which points at a <clipPath> in
 * the same markup and cannot fetch.
 */
function safeAttrValue(name: string, raw: string): string | null {
  if (raw.length > 4000) return null;
  const v = raw.trim();
  if (!v) return null;
  // No scheme of any kind, however it is cased or padded.
  if (/(javascript|data|vbscript|file)\s*:/i.test(v)) return null;
  if (/[<>]/.test(v)) return null;
  if (/url\(/i.test(v) && !/^url\(#[A-Za-z][\w-]*\)$/.test(v)) return null;
  // &#106;avascript: and friends — an entity is never needed in these values.
  if (/&#/.test(v)) return null;
  return v;
}

const MAX_LEN = 20000;
const MAX_ELEMENTS = 200;

/**
 * Rebuilds `input` as markup safe to inline inside an <svg>. Returns "" when
 * nothing survives.
 *
 * Accepts either a whole `<svg>…</svg>` document or just its children; the
 * outer <svg> is dropped either way, since the renderer supplies its own (and
 * with it the sizing and colour the template controls).
 */
export function sanitizeIconSvg(input: unknown): string {
  if (typeof input !== "string" || !input || input.length > MAX_LEN) return "";

  // Comments and CDATA can hide markup from a naive tag scan, and neither has
  // any business in an icon.
  let src = input.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  // Drop everything before/after the outer <svg> wrapper when there is one.
  const open = src.search(/<svg[\s>]/i);
  if (open >= 0) {
    const gt = src.indexOf(">", open);
    const close = src.toLowerCase().lastIndexOf("</svg>");
    if (gt >= 0) src = close > gt ? src.slice(gt + 1, close) : src.slice(gt + 1);
  }

  let out = "";
  let elements = 0;
  const openTags: string[] = [];

  // One pass over every tag. Text between tags is kept only inside <title>,
  // the one element here that has any.
  const TAG_RE = /<\s*(\/?)\s*([A-Za-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(src))) {
    const [full, slash, rawName, rawAttrs] = m;

    const between = src.slice(last, m.index);
    if (between && openTags[openTags.length - 1] === "title") out += escText(between);
    last = m.index + full.length;

    // A namespaced name (svg:script, xlink:foo) is never one of ours.
    const name = rawName.toLowerCase();
    if (name.includes(":") || !ALLOWED_TAGS.has(name)) continue;

    if (slash) {
      if (openTags[openTags.length - 1] === name) { openTags.pop(); out += `</${name}>`; }
      continue;
    }

    if (++elements > MAX_ELEMENTS) break;

    let attrs = "";
    const ATTR_RE = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let a: RegExpExecArray | null;
    while ((a = ATTR_RE.exec(rawAttrs))) {
      const rawKey = a[1].toLowerCase();
      // Every on* handler, plus anything namespaced (xlink:href, xml:base).
      if (rawKey.startsWith("on") || rawKey.includes(":")) continue;
      const key = ATTR_ALIASES[rawKey] || rawKey;
      if (!ALLOWED_ATTRS.has(key)) continue;
      const value = safeAttrValue(key, a[3] ?? a[4] ?? a[5] ?? "");
      if (value == null) continue;
      attrs += ` ${key}="${escAttr(value)}"`;
    }

    // Self-closed in the source, or an element that never has children.
    const selfClosing = /\/\s*>$/.test(full) || name === "path" || name === "line" || name === "polyline" || name === "polygon" || name === "circle" || name === "ellipse" || name === "rect";
    if (selfClosing) { out += `<${name}${attrs}/>`; continue; }
    openTags.push(name);
    out += `<${name}${attrs}>`;
  }

  // Close anything the source left open, innermost first, so the fragment can
  // never swallow the markup that follows it.
  while (openTags.length) out += `</${openTags.pop()}>`;
  return out;
}

/** A viewBox is four numbers and nothing else. */
export function safeViewBox(input: unknown, fallback = "0 0 24 24"): string {
  if (typeof input !== "string") return fallback;
  const v = input.trim();
  return /^-?\d+(\.\d+)?(\s+-?\d+(\.\d+)?){3}$/.test(v) ? v : fallback;
}
