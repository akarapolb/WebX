// A component's "custom CSS": a short list of `property: value` declarations typed by
// an editor. Everything here ends up in a <style> element on a PUBLIC page, so this is
// an allowlist, not a sanitiser: a declaration is kept only when its property is on the
// list below AND its value passes every check. Anything else is dropped, never repaired.
//
// What the checks rule out, and why:
//   - url(), image-set(), src(), attr(), env(): anything that makes the browser fetch or
//     read something. Images are set through the image controls instead.
//   - quotes, backslashes, braces, angle brackets, `@`, `;`, `=`, `&`, `?`, `[`, `]`:
//     the characters that could close the declaration, the rule or the <style> element,
//     start an at-rule, or smuggle in an escape sequence. The value character set below
//     contains none of them.
//   - font-family / font: fonts come from the theme (and are downloaded at build time).
//   - position other than static/relative, z-index beyond -10..100, and numbers beyond the
//     ranges the controls themselves allow (a width of 99999px, a margin of -100vh, a
//     translate of 99999px, a font size of 99999px, repeat(100000, 1px)): nothing here may
//     float over the rest of the page or cost the browser a huge layout. Where a value can be
//     built with calc()/min()/max()/clamp() (margins, transforms), those are not accepted at all,
//     since arithmetic could add small allowed numbers up to a large one.
//   - custom properties (`--x:`), animations and `content`: not on the list.
//   - var() other than the theme's own --wx-* tokens.
//
// KEEP IN SYNC: this file exists, identical, in public-site/templates/_builder and in
// webx-studio/lib. The two packages do not import each other (separate Docker builds), so
// a test in webx-studio compares the copies. The Studio uses it to tell editors which of
// their lines the site will ignore.

export const CUSTOM_CSS_MAX_CHARS = 1500;
export const CUSTOM_CSS_MAX_DECLARATIONS = 40;
const VALUE_MAX_CHARS = 160;

export const ALLOWED_PROPS: readonly string[] = [
  // box and layout
  "display", "visibility", "overflow", "overflow-x", "overflow-y", "position", "z-index",
  "width", "height", "min-width", "min-height", "max-width", "max-height", "aspect-ratio",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "gap", "row-gap", "column-gap", "flex", "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis",
  "grid-template-columns", "grid-template-rows", "grid-column", "grid-row", "grid-auto-flow",
  "align-items", "align-content", "align-self", "justify-content", "justify-items", "justify-self",
  "place-items", "place-content", "place-self", "order", "object-fit", "object-position", "float", "clear",
  // text
  "color", "font-size", "font-weight", "font-style", "font-variant", "line-height", "letter-spacing", "word-spacing",
  "text-align", "text-transform", "text-decoration", "text-decoration-line", "text-decoration-color", "text-decoration-thickness",
  "text-underline-offset", "text-indent", "text-shadow", "text-overflow", "white-space", "word-break", "overflow-wrap",
  "hyphens", "vertical-align", "list-style", "list-style-type",
  // surface
  "background", "background-color", "background-image", "background-size", "background-position", "background-repeat",
  "background-attachment", "background-blend-mode", "background-clip",
  "border", "border-top", "border-right", "border-bottom", "border-left", "border-width", "border-style", "border-color",
  "border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "outline", "outline-offset", "box-shadow", "opacity", "filter", "backdrop-filter", "mix-blend-mode", "clip-path",
  // motion and interaction
  "transform", "transform-origin", "transition", "transition-duration", "transition-timing-function", "transition-delay",
  "cursor", "pointer-events", "user-select", "scroll-margin-top",
];
const PROPS = new Set(ALLOWED_PROPS);

// Function names a value may call. url(), image-set(), attr(), env(), var() (except
// the theme's own tokens, handled separately), src() and the rest are not here.
const FUNCS = new Set([
  "calc", "min", "max", "clamp", "rgb", "rgba", "hsl", "hsla",
  "linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient",
  "translate", "translatex", "translatey", "translatez", "scale", "scalex", "scaley", "rotate", "skew", "skewx", "skewy",
  "blur", "brightness", "contrast", "grayscale", "saturate", "sepia", "invert", "hue-rotate", "drop-shadow", "opacity",
  "minmax", "repeat", "fit-content", "cubic-bezier", "steps", "polygon", "circle", "ellipse", "inset",
]);

// The only characters a value may contain. No quotes, backslash, ; { } < > @ = & ? [ ] | ~ ^ $ or `!`
// (a trailing !important is removed before this check) — and no `*`, so a calc() cannot multiply a
// small allowed number into a huge one.
const VALUE_CHARS = /^[A-Za-z0-9 .,%#()+\-/_]+$/;
// The theme's own variables are the only var() allowed, and without a fallback.
const THEME_VAR = /var\(--wx-[a-z0-9-]+\)/g;

const DISPLAYS = ["block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "none", "contents"];
const POSITIONS = ["static", "relative"];
const CURSORS = ["auto", "default", "pointer", "text", "move", "not-allowed", "grab", "grabbing", "help", "crosshair", "zoom-in", "zoom-out", "wait"];

// How big a number may be, by unit. Positive limits match what the size controls allow; the negative
// ones match the move control (400px). A unit that is not listed (fr, ch, none) is limited to +-100.
const MAX: Record<string, number> = { px: 4000, rem: 250, em: 250, vw: 100, vh: 100, vmin: 100, vmax: 100, "%": 300, deg: 3600, turn: 10, s: 10, ms: 10000 };
const MIN: Record<string, number> = { px: -400, rem: -25, em: -25, vw: -50, vh: -50, vmin: -50, vmax: -50, "%": -100, deg: -3600, turn: -10, s: 0, ms: 0 };
// A negative margin pulls a component up under its neighbour; the margin control stops at -200px.
const MARGIN_MIN: Record<string, number> = { px: -200, rem: -20, em: -20, vw: -30, vh: -30, vmin: -30, vmax: -30, "%": -50 };
const MARGIN_PROPS = new Set(["margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "scroll-margin-top"]);
// A translate moves a component; the move control stops at 400px, so this does too.
const TRANSLATE_MAX: Record<string, number> = { px: 400, rem: 25, em: 25, vw: 50, vh: 50, vmin: 50, vmax: 50, "%": 100 };
const MAX_NUMBERS_PER_VALUE = 12;
const MAX_SCALE = 5;
const MAX_REPEAT = 24;
// Properties that displace or enlarge a component by arithmetic on their value.
const NO_MATH_PROPS = new Set(["margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "transform", "text-indent", "scroll-margin-top"]);

/** True when every number in the value is within what the controls themselves allow. */
function numbersWithinBounds(prop: string, lower: string): boolean {
  // Theme variables and hex colours contain digits that are not quantities.
  const body = lower.replace(THEME_VAR, "0").replace(/#[0-9a-f]+/g, "#");
  // An exponent (1e9px) is a number the checks below would misread.
  if (/\d[e][+-]?\d/.test(body)) return false;
  const tokens = [...body.matchAll(/(?<![\w.])(-?)(\d*\.?\d+)([a-z%]*)/g)];
  if (tokens.length > MAX_NUMBERS_PER_VALUE) return false;
  for (const t of tokens) {
    const n = Number(t[1] + t[2]);
    const unit = t[3];
    if (n > (MAX[unit] ?? 100) || n < (MIN[unit] ?? -100)) return false;
    if (MARGIN_PROPS.has(prop) && n < (MARGIN_MIN[unit] ?? -100)) return false;
  }
  if (NO_MATH_PROPS.has(prop) && /(?:calc|min|max|clamp)\(/.test(body)) return false;
  for (const m of body.matchAll(/translate[xyz]?\(([^()]*)\)/g)) {
    for (const t of m[1].matchAll(/(-?\d*\.?\d+)([a-z%]*)/g)) if (Math.abs(Number(t[1])) > (TRANSLATE_MAX[t[2]] ?? 100)) return false;
  }
  for (const m of body.matchAll(/scale[xy]?\(([^()]*)\)/g)) {
    for (const t of m[1].matchAll(/-?\d*\.?\d+/g)) if (Math.abs(Number(t[0])) > MAX_SCALE) return false;
  }
  for (const m of body.matchAll(/repeat\(\s*(\d+)/g)) if (Number(m[1]) > MAX_REPEAT) return false;
  return true;
}

export type IgnoredLine = { text: string; reason: "malformed" | "unknown-property" | "bad-value" };
export type ParsedCustomCss = { accepted: { prop: string; value: string }[]; ignored: IgnoredLine[] };

/** The value as it will be written, or null when it is not allowed for this property. */
function checkValue(prop: string, raw: string): string | null {
  let v = raw.trim().replace(/\s*!important\s*$/i, "").trim();
  if (!v || v.length > VALUE_MAX_CHARS) return null;
  if (!VALUE_CHARS.test(v)) return null;
  v = v.replace(/\s+/g, " ");
  const lower = v.toLowerCase();
  // Belt and braces: the character set already makes these impossible to write as a real url().
  if (/url|expression|javascript|binding|behavior|import/.test(lower)) return null;

  // Parentheses must balance and stay shallow.
  let depth = 0;
  for (const ch of v) {
    if (ch === "(") { depth++; if (depth > 4) return null; }
    else if (ch === ")") { depth--; if (depth < 0) return null; }
  }
  if (depth !== 0) return null;

  // Every function called must be on the list; the theme's own variables are allowed, no others.
  const without = lower.replace(THEME_VAR, "0");
  for (const m of without.matchAll(/([a-z][a-z0-9-]*)\(/g)) if (!FUNCS.has(m[1])) return null;

  // z-index is clamped below instead of refused, like the control; every other number must be in range.
  if (prop !== "z-index" && !numbersWithinBounds(prop, lower)) return null;

  // Properties whose dangerous values are exactly the ones a general rule cannot see.
  if (prop === "position") return POSITIONS.includes(lower) ? lower : null;
  if (prop === "display") return DISPLAYS.includes(lower) ? lower : null;
  if (prop === "cursor") return CURSORS.includes(lower) ? lower : null;
  if (prop === "z-index") {
    if (!/^-?\d{1,3}$/.test(v)) return null;
    return String(Math.min(100, Math.max(-10, Number(v))));
  }
  return v;
}

/** Splits editor text into the declarations that are kept and the lines that are not. */
export function parseCustomCss(input: unknown): ParsedCustomCss {
  const out: ParsedCustomCss = { accepted: [], ignored: [] };
  if (typeof input !== "string") return out;
  let text = input.slice(0, CUSTOM_CSS_MAX_CHARS);
  // /* comments */ are removed, not interpreted.
  for (let a = text.indexOf("/*"); a !== -1; a = text.indexOf("/*")) {
    const b = text.indexOf("*/", a + 2);
    // A newline, not nothing and not a space: a comment can then never splice two halves of a value together.
    text = text.slice(0, a) + "\n" + (b === -1 ? "" : text.slice(b + 2));
  }
  for (const chunk of text.split(/[;\n\r]/)) {
    const line = chunk.trim();
    if (!line) continue;
    if (out.accepted.length >= CUSTOM_CSS_MAX_DECLARATIONS) { out.ignored.push({ text: line, reason: "bad-value" }); continue; }
    const colon = line.indexOf(":");
    if (colon < 1) { out.ignored.push({ text: line, reason: "malformed" }); continue; }
    const prop = line.slice(0, colon).trim().toLowerCase();
    if (!PROPS.has(prop)) { out.ignored.push({ text: line, reason: "unknown-property" }); continue; }
    const value = checkValue(prop, line.slice(colon + 1));
    if (value === null) { out.ignored.push({ text: line, reason: "bad-value" }); continue; }
    out.accepted.push({ prop, value });
  }
  return out;
}

/** The declarations to write into a rule, each marked !important like the rest of the component's style. */
export function customDecls(input: unknown): string[] {
  return parseCustomCss(input).accepted.map((d) => `${d.prop}:${d.value}!important`);
}
