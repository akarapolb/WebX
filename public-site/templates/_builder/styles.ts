// Per-component styling from the Visual Builder — the colour/size/background
// sibling of boxes.ts's move/resize. Shared by every template's Blocks.tsx
// (the live site) and the Builder's preview harness, so what the editor shows
// and what visitors get come from one implementation. Pure and server-safe:
// no React, no "use client", no DOM.
//
// Storage, on the block itself:
//   b.styles = { [componentKey]: Style }
//
// Per-device, as overrides that cascade down. The style itself applies at every
// width; `tablet` overrides it from 1023px down and `mobile` from 639px down
// (so a phone keeps the tablet's change unless it sets its own). Only what is
// set on a device changes — a heading sized for desktop stays a brand colour on
// the phone without being set a second time.
//
// Components are the elements a renderer tags with `vc(b, key)` (see
// boxes.ts): top-level fields ("heading", "lead", "cta1Label"…) and
// individual list items ("items.2"). Buttons are tagged in their own right,
// so styling one needs no special case here.
//
// SECURITY: every value below is interpolated into a <style> element on a
// public page, so nothing is trusted. Values are matched against exact
// patterns or clamped to a range, and anything unrecognised is dropped
// rather than escaped — a stylesheet has no safe way to carry an arbitrary
// string, and a dropped declaration only costs the author their styling.

import { isComponentKey } from "./boxes";
import { customDecls } from "./customCss";

/** What a component looks like while the pointer is over it, it has focus, or it is being pressed.
 * Only the properties that make sense to change at that moment — a hover that moved the layout would make the
 * element jump out from under the pointer. */
export type StateStyle = {
  color?: string;
  iconColor?: string;
  bg?: string;
  /** Gradient colours for this state; the type and angle come from the main style. */
  gradFrom?: string;
  gradTo?: string;
  borderColor?: string;
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  opacity?: number;
  /** Transform for this state (a hover lift or zoom); a part left out keeps the main style's. */
  scale?: number; rotate?: number; moveX?: number; moveY?: number;
};
/** The widths a style can be overridden at; each also applies to every narrower width. */
export const DEVICES = ["tablet", "mobile"] as const;
export type DeviceName = (typeof DEVICES)[number];
const DEVICE_MAX_WIDTH: Record<DeviceName, string> = { tablet: "(max-width: 1023.98px)", mobile: "(max-width: 639.98px)" };

/** The interaction states a style can carry, in the order they are emitted (later wins a tie). */
export const STATES = ["hover", "focus", "active"] as const;
export type StateName = (typeof STATES)[number];

export type Style = {
  /** Text colour — applied to the component AND the text inside it. */
  color?: string;
  /** Icon colour. Overrides `color` for the SVG icons inside the component. */
  iconColor?: string;
  /** Background colour. */
  bg?: string;
  /** Background image URL (same-site path or http(s)). */
  bgImage?: string;
  /** How a background image fills the element. */
  bgFit?: "cover" | "contain" | "auto";
  /** Background image tiling. */
  bgRepeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  /** Where a background image sits — one of the nine anchor points. */
  bgPosition?: "left top" | "center top" | "right top" | "left center" | "center" | "right center" | "left bottom" | "center bottom" | "right bottom";
  /** "fixed" keeps the image still while the page scrolls past it. */
  bgAttachment?: "scroll" | "fixed";
  /** A colour laid over the background image (usually translucent) so text on it stays readable. */
  bgOverlay?: string;
  /** Gradient background: its two colours (hex or theme token). With only one, the other end is transparent. */
  gradFrom?: string;
  gradTo?: string;
  /** Direction of a linear gradient, degrees (0 = upwards, 90 = to the right, 180 = downwards). Default 180. */
  gradAngle?: number;
  gradType?: "linear" | "radial";
  /** Font size, px. */
  fontSize?: number;
  /** Font weight, 100–900. */
  fontWeight?: number;
  /** Text alignment. */
  align?: "left" | "center" | "right";
  /** The theme's heading font, its body font, or a monospace stack. */
  fontFamily?: "heading" | "body" | "mono";
  /** Line height as a multiple of the font size (0.8–3). Wins over the 1.25 a font size sets on its own. */
  lineHeight?: number;
  /** Space between letters, in em (-0.1–0.5). */
  letterSpacing?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  textDecoration?: "none" | "underline" | "line-through";
  fontStyle?: "normal" | "italic";
  /** Corner radius, px. */
  radius?: number;
  /** Inner spacing, px. */
  padding?: number;
  /** Unit of the per-side spacing values below (and only those). Default px. */
  unit?: "px" | "rem" | "em" | "%";
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  marginTop?: number; marginRight?: number; marginBottom?: number; marginLeft?: number;
  /** Size, as a number and a unit written together ("50%", "320px", "60vh"). Width and height also take "auto"; the maximums "none". */
  width?: string; height?: string;
  minWidth?: string; minHeight?: string;
  maxWidth?: string; maxHeight?: string;
  /** How the component lays out its children. "none" hides it (use on a tablet or phone override to hide it at that width). */
  display?: "block" | "flex" | "grid" | "inline-block" | "none";
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  justifyContent?: "start" | "center" | "end" | "between" | "around" | "evenly";
  alignItems?: "start" | "center" | "end" | "stretch" | "baseline";
  flexWrap?: "nowrap" | "wrap";
  /** Space between children, a size such as "16px" or "1rem". */
  gap?: string;
  /** Equal columns of a grid, 1–12. */
  gridColumns?: number;
  /** Only static and relative: nothing that could float over the rest of the page. */
  position?: "static" | "relative";
  /** Stacking order, -10 to 100 (it only has an effect on a positioned component). */
  zIndex?: number;
  overflow?: "visible" | "hidden" | "auto";
  /** Border width, px. 0 removes the border. */
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted" | "double";
  borderColor?: string;
  /** A fixed drop-shadow preset. A custom shadow below wins over it. */
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  /** A custom shadow: offsets (px, -100–100), blur (0–200), spread (-100–100), colour (hex or theme token), and inset. Unset parts default to 0 / 4 / 12 / 0 / 25% black. */
  shadowX?: number; shadowY?: number; shadowBlur?: number; shadowSpread?: number;
  shadowColor?: string;
  shadowInset?: boolean;
  /** Opacity, percent (0 = invisible). */
  opacity?: number;
  /** Extra declarations, one `property: value` per line or ending in ";". Only an allowlist of safe properties and values is applied (see customCss.ts); the rest is ignored. */
  customCss?: string;
  /** Scale, percent (25–300); rotation, degrees (-360–360); move, px (-400–400). Composed as move, rotate, scale. */
  scale?: number; rotate?: number; moveX?: number; moveY?: number;
  /** How long a hover/focus/pressed change fades, ms (0–2000, default 180), and its easing. */
  transitionMs?: number;
  easing?: "ease" | "linear" | "ease-in" | "ease-out" | "ease-in-out";
  /** Entrance animation: plays as the component scrolls into view (where the browser supports it) or when the page loads. */
  animation?: "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "zoom";
  /** Entrance length, ms (100–3000, default 600), and delay before it starts (0–3000). */
  animMs?: number; animDelayMs?: number;
  /** While the pointer is over the component (mouse and trackpad only). */
  hover?: StateStyle;
  /** While the component, or something inside it, has keyboard focus. */
  focus?: StateStyle;
  /** While the component is being pressed. */
  active?: StateStyle;
  /** Overrides from 1023px down. Same properties as above, minus states and further overrides. */
  tablet?: DeviceStyle;
  /** Overrides from 639px down. */
  mobile?: DeviceStyle;
  /** Overrides while the visitor is in dark mode, at every width. Same properties, minus states and further overrides. */
  dark?: DeviceStyle;
};
export type DeviceStyle = Omit<Style, "hover" | "focus" | "active" | "tablet" | "mobile" | "dark">;

/** The style keys this module knows how to render, for the editor's own use. */
export const STYLE_KEYS = [
  "color", "iconColor", "bg", "bgImage", "bgFit", "bgRepeat", "bgPosition", "bgAttachment", "bgOverlay",
  "gradFrom", "gradTo", "gradAngle", "gradType",
  "fontSize", "fontWeight", "align", "fontFamily", "lineHeight", "letterSpacing", "textTransform", "textDecoration", "fontStyle",
  "radius", "padding", "unit",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
  "display", "flexDirection", "justifyContent", "alignItems", "flexWrap", "gap", "gridColumns", "position", "zIndex", "overflow",
  "borderWidth", "borderStyle", "borderColor", "shadow", "shadowX", "shadowY", "shadowBlur", "shadowSpread", "shadowColor", "shadowInset", "opacity",
  "scale", "rotate", "moveX", "moveY", "transitionMs", "easing", "animation", "animMs", "animDelayMs", "customCss",
  "hover", "focus", "active", "tablet", "mobile", "dark",
] as const;

// #rgb / #rgba / #rrggbb / #rrggbbaa — the only colour syntax accepted. The
// Builder's picker normalises everything it produces to one of these, so
// rejecting rgb()/hsl()/named colours costs nothing and keeps this a single
// unambiguous pattern rather than a parser.
const COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const isSafeColor = (v: unknown): v is string => typeof v === "string" && COLOR_RE.test(v);

// Theme colour tokens: a colour field may name a theme colour ("@primary") instead
// of a hex, so changing the theme recolours every component that points at it.
// Only these exact names are accepted; each becomes var(--wx-c-<name>), which the
// tenant's stylesheet (core four) and the theme CSS (c1–c8, the custom palette)
// define. Never a free-form variable name.
export const COLOR_TOKENS = ["primary", "accent", "ground", "ink", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;
const TOKEN_RE = /^@(?:primary|accent|ground|ink|c[1-8])$/;
export const isColorToken = (v: unknown): v is string => typeof v === "string" && TOKEN_RE.test(v);
/** The CSS for a colour value — a hex as it is, a token as its variable — or undefined when neither. */
export function colorCss(v: unknown): string | undefined {
  if (isSafeColor(v)) return v;
  if (isColorToken(v)) return `var(--wx-c-${v.slice(1)})`;
  return undefined;
}

// A background image URL, allowed only as a site-relative path or an
// absolute http(s) URL. The character denylist is what actually does the
// security work: without it a value like `x.png");background:url("evil` (or
// anything carrying a quote, paren, backslash, semicolon or angle bracket)
// could close the url() and start a declaration — or a </style> — of its own.
const URL_CHARS_RE = /^[A-Za-z0-9\-._~:/?#\[\]@!$&*+,;=%]+$/;
export function isSafeImageUrl(v: unknown): v is string {
  if (typeof v !== "string" || !v || v.length > 2000) return false;
  if (/["'()\\<>\s]/.test(v)) return false;
  if (!URL_CHARS_RE.test(v)) return false;
  if (v.startsWith("//")) return false; // protocol-relative — scheme comes from the page, so it isn't one of the two below
  return v.startsWith("/") || /^https?:\/\/[^/]/.test(v);
}

const clamp = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

const FITS = ["cover", "contain", "auto"] as const;
const REPEATS = ["no-repeat", "repeat", "repeat-x", "repeat-y"] as const;
const POSITIONS = ["left top", "center top", "right top", "left center", "center", "right center", "left bottom", "center bottom", "right bottom"] as const;
const ATTACHMENTS = ["scroll", "fixed"] as const;
const BORDER_STYLES = ["solid", "dashed", "dotted", "double"] as const;
const UNITS = ["px", "rem", "em", "%"] as const;
/** Fixed presets — a shadow is never taken from the stored value, only chosen by name. */
const SHADOWS = {
  none: "none",
  sm: "0 1px 3px rgba(0,0,0,.18)",
  md: "0 6px 16px rgba(0,0,0,.20)",
  lg: "0 14px 32px rgba(0,0,0,.25)",
  xl: "0 28px 60px rgba(0,0,0,.32)",
} as const;
type Unit = (typeof UNITS)[number];
// Allowed range per unit. Margins may be negative (pull an element up under its neighbour).
const SPACE_RANGE: Record<"padding" | "margin", Record<Unit, [number, number]>> = {
  padding: { px: [0, 400], rem: [0, 40], em: [0, 40], "%": [0, 50] },
  margin: { px: [-200, 400], rem: [-20, 40], em: [-20, 40], "%": [-50, 100] },
};
/** One spacing value as CSS ("1.5rem"), or undefined when it is not a finite number. */
function space(v: unknown, kind: "padding" | "margin", unit: Unit): string | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const [lo, hi] = SPACE_RANGE[kind][unit];
  return `${Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100}${unit}`;
}
// A size such as "50%" or "320px": digits, an optional decimal, and one of a fixed
// set of units — nothing else, so there is nothing to escape. The range depends
// on the unit (a width of 4000% is a typo, not a design).
const DIM_RE = /^(\d{1,4}(?:\.\d{1,2})?)(px|%|rem|em|vw|vh)$/;
const DIM_RANGE: Record<string, [number, number]> = { px: [0, 4000], "%": [0, 100], rem: [0, 250], em: [0, 250], vw: [0, 100], vh: [0, 100] };
function dimension(v: unknown, keyword?: "auto" | "none"): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (keyword && t === keyword) return keyword;
  const m = DIM_RE.exec(t);
  if (!m) return undefined;
  const [lo, hi] = DIM_RANGE[m[2]];
  return `${Math.min(hi, Math.max(lo, Number(m[1])))}${m[2]}`;
}
const DIM_PROPS: [keyof Style, string, "auto" | "none" | undefined][] = [
  ["width", "width", "auto"], ["height", "height", "auto"],
  ["minWidth", "min-width", undefined], ["minHeight", "min-height", undefined],
  ["maxWidth", "max-width", "none"], ["maxHeight", "max-height", "none"],
];

/** Like clamp, but null, "" and non-numbers mean "not set" rather than 0. */
const clampSet = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? clamp(v, lo, hi) : undefined;
const ALIGNS = ["left", "center", "right"] as const;

const GRAD_TYPES = ["linear", "radial"] as const;
const DISPLAYS = ["block", "flex", "grid", "inline-block", "none"] as const;
const FLEX_DIRECTIONS = ["row", "column", "row-reverse", "column-reverse"] as const;
const JUSTIFY = { start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around", evenly: "space-evenly" } as const;
const ALIGN_ITEMS = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "baseline" } as const;
const FLEX_WRAPS = ["nowrap", "wrap"] as const;
const POSITIONS_LAYOUT = ["static", "relative"] as const;
const OVERFLOWS = ["visible", "hidden", "auto"] as const;
/** The CSS value for a name from a fixed map, or undefined — own keys only, so "constructor" and friends never match. */
const mapped = <T extends Record<string, string>>(v: unknown, map: T): T[keyof T] | undefined =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(map, v) ? (map[v] as T[keyof T]) : undefined;
const FONT_FAMILIES = {
  heading: "var(--wx-font-heading)",
  body: "var(--wx-font-body)",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
} as const;
const TEXT_TRANSFORMS = ["none", "uppercase", "lowercase", "capitalize"] as const;
const TEXT_DECORATIONS = ["none", "underline", "line-through"] as const;
const FONT_STYLES = ["normal", "italic"] as const;
/** A decimal clamped to a range and rounded to `places`; null, "" and non-numbers mean "not set". */
function decimal(v: unknown, lo: number, hi: number, places: number): number | undefined {
  // Only a number or a non-empty string: Number([]) is 0 and Number(true) is 1, which would read as a real value.
  if (typeof v !== "number" && !(typeof v === "string" && v.trim() !== "")) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const f = 10 ** places;
  return Math.round(Math.min(hi, Math.max(lo, n)) * f) / f;
}

/** A two-colour gradient, or undefined when neither colour is set. A missing end is transparent, which makes a fade. */
function gradientCss(s: { gradFrom?: unknown; gradTo?: unknown; gradAngle?: unknown; gradType?: unknown }): string | undefined {
  const from = colorCss(s.gradFrom), to = colorCss(s.gradTo);
  if (!from && !to) return undefined;
  const a = from ?? "transparent", b = to ?? "transparent";
  if (oneOf(s.gradType, GRAD_TYPES) === "radial") return `radial-gradient(circle at center,${a},${b})`;
  return `linear-gradient(${clampSet(s.gradAngle, 0, 360) ?? 180}deg,${a},${b})`;
}

/**
 * The stacked background layers, top to bottom: the colour overlay, the gradient,
 * the image. A translucent gradient therefore tints a photo, and the overlay
 * still sits above both so text stays readable. Undefined when there is neither
 * an image nor a gradient (an overlay alone has nothing to cover).
 */
function backgroundLayers(s: Style): string | undefined {
  const grad = gradientCss(s);
  // Quoted so a URL containing a comma or a keyword can't be read as extra
  // background layers; the denylist above already guarantees no quote of its
  // own can appear inside.
  const img = isSafeImageUrl(s.bgImage) ? `url("${s.bgImage}")` : undefined;
  if (!grad && !img) return undefined;
  const ov = colorCss(s.bgOverlay);
  // An overlay is a one-colour gradient. The single size/position/repeat values
  // emitted with the image repeat across every layer, so they need no pairing.
  return [ov ? `linear-gradient(${ov},${ov})` : undefined, grad, img].filter(Boolean).join(",");
}

const TRANSFORM_KEYS = ["scale", "rotate", "moveX", "moveY"] as const;
const touchesTransform = (s: { scale?: unknown; rotate?: unknown; moveX?: unknown; moveY?: unknown }): boolean =>
  TRANSFORM_KEYS.some((k) => clampSet((s as any)[k], -1e9, 1e9) !== undefined);
/** `transform` for the parts that are set, composed move → rotate → scale; undefined when none is. */
function transformCss(s: { scale?: unknown; rotate?: unknown; moveX?: unknown; moveY?: unknown }): string | undefined {
  const mx = clampSet(s.moveX, -400, 400), my = clampSet(s.moveY, -400, 400);
  const rot = clampSet(s.rotate, -360, 360), sc = clampSet(s.scale, 25, 300);
  const parts: string[] = [];
  if (mx !== undefined || my !== undefined) parts.push(`translate(${mx ?? 0}px,${my ?? 0}px)`);
  if (rot !== undefined) parts.push(`rotate(${rot}deg)`);
  if (sc !== undefined) parts.push(`scale(${sc / 100})`);
  return parts.length ? parts.join(" ") : undefined;
}
const EASINGS = ["ease", "linear", "ease-in", "ease-out", "ease-in-out"] as const;
// Entrance animations. Only the starting look is written: the end is whatever the
// component already looks like, so an entrance never overwrites its own transform.
const ANIMATIONS = {
  fade: "opacity:0",
  "slide-up": "opacity:0;transform:translateY(24px)",
  "slide-down": "opacity:0;transform:translateY(-24px)",
  "slide-left": "opacity:0;transform:translateX(24px)",
  "slide-right": "opacity:0;transform:translateX(-24px)",
  zoom: "opacity:0;transform:scale(.92)",
} as const;
type AnimationName = keyof typeof ANIMATIONS;
const SHADOW_KEYS = ["shadowX", "shadowY", "shadowBlur", "shadowSpread", "shadowColor"] as const;
// Only a part that is actually valid counts: a typo in a number must not conjure up a default shadow.
const touchesShadow = (s: Style): boolean =>
  SHADOW_KEYS.some((k) => (k === "shadowColor" ? colorCss(s.shadowColor) !== undefined : clampSet((s as any)[k], -1e9, 1e9) !== undefined));
/** A custom shadow's CSS, or undefined when none of its parts is set. Unset parts take sensible defaults, so a lone colour or blur still shows. */
function customShadow(s: Style): string | undefined {
  if (!touchesShadow(s)) return undefined;
  const x = clampSet(s.shadowX, -100, 100) ?? 0;
  const y = clampSet(s.shadowY, -100, 100) ?? 4;
  const blur = clampSet(s.shadowBlur, 0, 200) ?? 12;
  const spread = clampSet(s.shadowSpread, -100, 100) ?? 0;
  const color = colorCss(s.shadowColor) ?? "rgba(0,0,0,.25)";
  return `${s.shadowInset === true ? "inset " : ""}${x}px ${y}px ${blur}px ${spread}px ${color}`;
}
const LAYER_KEYS = ["bgImage", "bgOverlay", "gradFrom", "gradTo", "gradAngle", "gradType"] as const;
const isSetValue = (v: unknown) => v !== undefined && v !== null && v !== "";
const touchesLayers = (s: Style): boolean => LAYER_KEYS.some((k) => isSetValue((s as any)[k]));
const NESTED = new Set(["hover", "focus", "active", "tablet", "mobile", "dark"]);
/** `base` with every plain property `over` sets laid on top (states and overrides are not carried across). */
function mergeStyle(base: Style, over: Style): Style {
  const out: any = {};
  for (const k of Object.keys(base)) if (!NESTED.has(k)) out[k] = (base as any)[k];
  for (const k of Object.keys(over)) if (!NESTED.has(k) && isSetValue((over as any)[k])) out[k] = (over as any)[k];
  return out;
}

/**
 * The CSS declarations one component's style produces ("" when none survive).
 *
 * `partial` is for a device override, which only carries what changes: a
 * background position or a border colour set on its own still applies (to the
 * image or border the base style already made), where the base style only emits
 * those alongside the image or width they belong to.
 */
export function styleDecls(s: Style | null | undefined, partial = false, effective?: Style): string {
  if (!s || typeof s !== "object" || Array.isArray(s)) return "";
  const d: string[] = [];

  const col = colorCss(s.color);
  if (col) d.push(`color:${col}!important`);
  const bgc = colorCss(s.bg);
  if (bgc) d.push(`background-color:${bgc}!important`);
  // `effective` is the style as it stands at this width: the base with every
  // wider override laid on, then this one. A device override rebuilds the
  // background layers only when it changes one of them, from what it inherits
  // plus its own change — not from itself alone, which would drop the base image
  // just to turn a gradient round.
  const eff = effective ?? s;
  const layers = !partial || touchesLayers(s) ? backgroundLayers(eff) : undefined;
  if (layers) d.push(`background-image:${layers}!important`);
  if (isSafeImageUrl(s.bgImage)) {
    d.push(`background-size:${oneOf(s.bgFit, FITS) || "cover"}!important`);
    d.push(`background-position:${oneOf(s.bgPosition, POSITIONS) || "center"}!important`);
    d.push(`background-repeat:${oneOf(s.bgRepeat, REPEATS) || "no-repeat"}!important`);
    const att = oneOf(s.bgAttachment, ATTACHMENTS);
    if (att) d.push(`background-attachment:${att}!important`);
  } else if (partial) {
    const fit = oneOf(s.bgFit, FITS), pos = oneOf(s.bgPosition, POSITIONS), rep = oneOf(s.bgRepeat, REPEATS), att = oneOf(s.bgAttachment, ATTACHMENTS);
    if (fit) d.push(`background-size:${fit}!important`);
    if (pos) d.push(`background-position:${pos}!important`);
    if (rep) d.push(`background-repeat:${rep}!important`);
    if (att) d.push(`background-attachment:${att}!important`);
  }

  const fs = clamp(s.fontSize, 8, 200);
  if (fs !== undefined) d.push(`font-size:${fs}px!important`);
  // A font size alone tightens the line to 1.25 (the original behaviour); an
  // explicit line height — set here, or inherited by a device override — wins.
  const lh = decimal(s.lineHeight, 0.8, 3, 2);
  if (lh !== undefined) d.push(`line-height:${lh}!important`);
  else if (fs !== undefined && decimal(eff.lineHeight, 0.8, 3, 2) === undefined) d.push("line-height:1.25!important");

  const ff = typeof s.fontFamily === "string" && Object.prototype.hasOwnProperty.call(FONT_FAMILIES, s.fontFamily) ? (s.fontFamily as keyof typeof FONT_FAMILIES) : undefined;
  if (ff) d.push(`font-family:${FONT_FAMILIES[ff]}!important`);
  const ls = decimal(s.letterSpacing, -0.1, 0.5, 3);
  if (ls !== undefined) d.push(`letter-spacing:${ls}em!important`);
  const tt = oneOf(s.textTransform, TEXT_TRANSFORMS);
  if (tt) d.push(`text-transform:${tt}!important`);
  const td = oneOf(s.textDecoration, TEXT_DECORATIONS);
  if (td) d.push(`text-decoration-line:${td}!important`);
  const fst = oneOf(s.fontStyle, FONT_STYLES);
  if (fst) d.push(`font-style:${fst}!important`);

  const fw = clamp(s.fontWeight, 100, 900);
  // Only the nine real CSS weights — an in-between number is a typo, not a
  // finer gradation, and would round to a weight the font may not have.
  if (fw !== undefined && fw % 100 === 0) d.push(`font-weight:${fw}!important`);

  const al = oneOf(s.align, ALIGNS);
  if (al) d.push(`text-align:${al}!important`);

  const r = clamp(s.radius, 0, 999);
  if (r !== undefined) d.push(`border-radius:${r}px!important`);

  const p = clamp(s.padding, 0, 400);
  if (p !== undefined) d.push(`padding:${p}px!important`);

  // Per-side spacing, after the all-sides shorthand so a side overrides it.
  const unit = oneOf(s.unit, UNITS) || "px";
  const sides: [string, unknown, "padding" | "margin"][] = [
    ["padding-top", s.paddingTop, "padding"], ["padding-right", s.paddingRight, "padding"],
    ["padding-bottom", s.paddingBottom, "padding"], ["padding-left", s.paddingLeft, "padding"],
    ["margin-top", s.marginTop, "margin"], ["margin-right", s.marginRight, "margin"],
    ["margin-bottom", s.marginBottom, "margin"], ["margin-left", s.marginLeft, "margin"],
  ];
  for (const [prop, v, kind] of sides) {
    const css = space(v, kind, unit);
    if (css !== undefined) d.push(`${prop}:${css}!important`);
  }

  for (const [key, prop, kw] of DIM_PROPS) {
    const v = dimension((s as any)[key], kw);
    if (v !== undefined) d.push(`${prop}:${v}!important`);
  }

  const disp = oneOf(s.display, DISPLAYS);
  if (disp) d.push(`display:${disp}!important`);
  const fdir = oneOf(s.flexDirection, FLEX_DIRECTIONS);
  if (fdir) d.push(`flex-direction:${fdir}!important`);
  const jc = mapped(s.justifyContent, JUSTIFY);
  if (jc) d.push(`justify-content:${jc}!important`);
  const ai = mapped(s.alignItems, ALIGN_ITEMS);
  if (ai) d.push(`align-items:${ai}!important`);
  const fw2 = oneOf(s.flexWrap, FLEX_WRAPS);
  if (fw2) d.push(`flex-wrap:${fw2}!important`);
  const gp = dimension(s.gap);
  if (gp !== undefined) d.push(`gap:${gp}!important`);
  const gc = clampSet(s.gridColumns, 1, 12);
  if (gc !== undefined) d.push(`grid-template-columns:repeat(${gc},minmax(0,1fr))!important`);
  const pos = oneOf(s.position, POSITIONS_LAYOUT);
  if (pos) d.push(`position:${pos}!important`);
  const zi = clampSet(s.zIndex, -10, 100);
  if (zi !== undefined) d.push(`z-index:${zi}!important`);
  const ov = oneOf(s.overflow, OVERFLOWS);
  if (ov) d.push(`overflow:${ov}!important`);

  const bw = clampSet(s.borderWidth, 0, 20);
  if (bw !== undefined) {
    d.push(`border-style:${bw === 0 ? "none" : oneOf(s.borderStyle, BORDER_STYLES) || "solid"}!important`);
    d.push(`border-width:${bw}px!important`);
    const bc = colorCss(s.borderColor);
    if (bc && bw > 0) d.push(`border-color:${bc}!important`);
  } else if (partial) {
    const bs = oneOf(s.borderStyle, BORDER_STYLES), bc = colorCss(s.borderColor);
    if (bs) d.push(`border-style:${bs}!important`);
    if (bc) d.push(`border-color:${bc}!important`);
  }

  // A custom shadow wins over a preset. On a device override, whichever the
  // override itself sets decides; custom parts it leaves out come from what it inherits.
  const sh = oneOf(s.shadow, Object.keys(SHADOWS) as (keyof typeof SHADOWS)[]);
  const customHere = touchesShadow(s) || (partial && typeof s.shadowInset === "boolean");
  const custom = !partial || customHere ? customShadow(eff) : undefined;
  if (custom && (customHere || !partial || !sh)) d.push(`box-shadow:${custom}!important`);
  else if (sh) d.push(`box-shadow:${SHADOWS[sh]}!important`);

  const op = clampSet(s.opacity, 0, 100);
  if (op !== undefined) d.push(`opacity:${op / 100}!important`);

  // Moves, rotation and scale compose with the individual `translate` property a
  // moved component already uses, so the two never fight.
  const tf = !partial || touchesTransform(s) ? transformCss(eff) : undefined;
  if (tf) d.push(`transform:${tf}!important`);

  // Custom CSS comes last so it wins over what the controls above produced.
  for (const decl of customDecls(s.customCss)) d.push(decl);

  return d.join(";");
}

/** Declarations for one interaction state (empty when none survive). Colours, shadow and opacity only. */
function stateDecls(s: StateStyle | null | undefined, base?: Style | null): string {
  if (!s || typeof s !== "object" || Array.isArray(s)) return "";
  const d: string[] = [];
  const col = colorCss(s.color);
  if (col) d.push(`color:${col}!important`);
  const bgc = colorCss(s.bg);
  if (bgc) d.push(`background-color:${bgc}!important`);
  // A state's gradient: its own colours over the main style's type, angle, image
  // and overlay (a missing colour falls back to the main style's). A gradient
  // can't fade between two looks the way a plain colour does; it switches.
  if (colorCss(s.gradFrom) || colorCss(s.gradTo)) {
    const merged: Style = { ...(base || {}), gradFrom: colorCss(s.gradFrom) ? s.gradFrom : base?.gradFrom, gradTo: colorCss(s.gradTo) ? s.gradTo : base?.gradTo };
    const layers = backgroundLayers(merged);
    if (layers) d.push(`background-image:${layers}!important`);
  }
  const bc = colorCss(s.borderColor);
  if (bc) d.push(`border-color:${bc}!important`);
  const sh = oneOf(s.shadow, Object.keys(SHADOWS) as (keyof typeof SHADOWS)[]);
  if (sh) d.push(`box-shadow:${SHADOWS[sh]}!important`);
  const op = clampSet(s.opacity, 0, 100);
  if (op !== undefined) d.push(`opacity:${op / 100}!important`);
  // A state's transform is the main style's with this state's parts laid over it.
  if (touchesTransform(s)) {
    const tf = transformCss({
      scale: isSetValue(s.scale) ? s.scale : base?.scale, rotate: isSetValue(s.rotate) ? s.rotate : base?.rotate,
      moveX: isSetValue(s.moveX) ? s.moveX : base?.moveX, moveY: isSetValue(s.moveY) ? s.moveY : base?.moveY,
    });
    if (tf) d.push(`transform:${tf}!important`);
  }
  return d.join(";");
}

// Elements inside a component that carry no tag of their own, and not icons.
const INNER_TEXT = ":not([data-vb-c]):not(svg):not(svg *)";

/**
 * The rules that carry a colour into a component's text and icons, for any
 * selector `sel` (a plain component or one of its states).
 *
 * Colour has to reach the text INSIDE a component, not just the element that
 * carries the tag. A card is tagged as one unit ("items.0") but its title, body
 * and icon are children with colour rules of their own, and a rule on a child
 * beats a value inherited from its parent — so setting the card's colour used
 * to change nothing at all. Text tagged directly (a heading) always worked,
 * which is why only some components failed.
 *
 * Elements that carry their own tag are skipped so they keep whatever was set
 * on them specifically, and SVGs are skipped so the icon colour can own them.
 */
function colourReach(sel: string, color: unknown, icon: unknown, twiceSel?: string): string {
  let css = "";
  const textColor = colorCss(color);
  if (textColor) {
    css += `${sel} ${INNER_TEXT}{color:${textColor}!important}`;
    // An icon follows the text colour unless it has been given its own.
    css += `${sel} svg,${sel} svg *{color:${textColor}!important}`;
  }
  // The selector repeats itself on purpose: two attribute pairs put this above
  // the text-colour rules, so an icon colour wins over the colour of the text it
  // sits in regardless of which rule is emitted first.
  const iconColor = colorCss(icon);
  if (iconColor) {
    const twice = twiceSel ?? sel + sel;
    css += `${twice} svg,${twice} svg *{color:${iconColor}!important}`;
  }
  return css;
}

// The pseudo-class each state listens to. Focus is two separate rules, not one
// selector list: a browser that doesn't know :focus-visible would drop the whole
// list, taking :focus-within with it.
const STATE_PSEUDO: Record<StateName, string[]> = {
  hover: [":hover"],
  focus: [":focus-visible", ":focus-within"],
  active: [":active"],
};
const TRANSITION_PROPS = ["color", "background-color", "border-color", "box-shadow", "opacity", "transform"];
const transitionFor = (st: Style): string => {
  const ms = clampSet(st.transitionMs, 0, 2000) ?? 180;
  const ez = oneOf(st.easing, EASINGS) ?? "ease";
  return TRANSITION_PROPS.map((p) => `${p} ${ms}ms ${ez}`).join(",");
};
/** The entrance animation for `sel`, and the name to define keyframes for. */
function entrance(sel: string, st: Style): { css: string; name: AnimationName } | undefined {
  const name = typeof st.animation === "string" && Object.prototype.hasOwnProperty.call(ANIMATIONS, st.animation) ? (st.animation as AnimationName) : undefined;
  if (!name) return undefined;
  const ms = clampSet(st.animMs, 100, 3000) ?? 600;
  const delay = clampSet(st.animDelayMs, 0, 3000) ?? 0;
  // Where the browser can tie it to scrolling, it plays as the component enters the
  // view; elsewhere it plays once the page loads. Never for visitors who asked for less motion.
  const css = `@media (prefers-reduced-motion:no-preference){${sel}{animation:wx-in-${name} ${ms}ms ease-out ${delay}ms both}` +
    `@supports (animation-timeline:view()){${sel}{animation:wx-in-${name} auto linear both;animation-timeline:view();animation-range:entry 0% entry 60%}}}`;
  return { css, name };
}

/** Every rule one component's style produces, for the selector `sel`. */
function styleCss(sel: string, st: Style | null | undefined, usedAnimations?: Set<AnimationName>): string {
  if (!st || typeof st !== "object") return "";
  let css = "";
  const enter = entrance(sel, st);
  if (enter) { css += enter.css; usedAnimations?.add(enter.name); }
  const decls = styleDecls(st);
  if (decls) css += `${sel}{${decls}}`;
  css += colourReach(sel, st.color, st.iconColor);

  // Device overrides, after the base and in width order so the narrowest wins:
  // tablet applies from 1023px down, then mobile from 639px down on top of it.
  // Everything cascades: each width starts from what the wider one ended with
  // (so a font size change keeps an inherited line height, and a gradient turned
  // round keeps its colours and image).
  let eff: Style = st;
  for (const dev of DEVICES) {
    const o = (st as any)[dev];
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    eff = mergeStyle(eff, o);
    const dd = styleDecls(o, true, eff);
    const rules = (dd ? `${sel}{${dd}}` : "") + colourReach(sel, o.color, o.iconColor);
    if (rules) css += `@media ${DEVICE_MAX_WIDTH[dev]}{${rules}}`;
  }

  // Dark mode: the look to use while the visitor is in dark mode, at every width.
  // `:where()` adds no specificity, so these rules tie with the style's own and win
  // by coming later — and still lose to hover/focus/pressed, which add a pseudo-class.
  const dk = (st as any).dark;
  if (dk && typeof dk === "object" && !Array.isArray(dk)) {
    const prefix = ':where(:root[data-theme="dark"]) ';
    const dsel = prefix + sel;
    const dd = styleDecls(dk, true, mergeStyle(st, dk));
    // The repeated selector for icon colour sits behind the dark prefix, not inside it.
    const reach = colourReach(dsel, dk.color, dk.iconColor, prefix + sel + sel);
    if (dd || reach) css += (dd ? `${dsel}{${dd}}` : "") + reach;
  }

  // Interaction states. They come after the base rules and add a pseudo-class
  // (more specific), so they win while they apply without any ordering tricks.
  let stated = false, statedColour = false;
  for (const name of STATES) {
    const stateStyle = (st as any)[name];
    const sd = stateDecls(stateStyle, st);
    const reach = (sx: string) => colourReach(sx, stateStyle?.color, stateStyle?.iconColor);
    if (!sd && !reach(sel)) continue;
    stated = true;
    if (colorCss(stateStyle?.color) || colorCss(stateStyle?.iconColor)) statedColour = true;
    for (const pseudo of STATE_PSEUDO[name]) {
      const rule = (sd ? `${sel}${pseudo}{${sd}}` : "") + reach(sel + pseudo);
      // Hover is for a pointer. On a touch screen it would stay stuck on after a
      // tap, so it only applies where hovering is real.
      css += name === "hover" ? `@media (hover:hover){${rule}}` : rule;
    }
  }
  // Fade between states — but not for anyone who asked their system to cut motion.
  if (stated) {
    const trans = transitionFor(st);
    let t = `${sel}{transition:${trans}}`;
    // Text inside the component is its own element, so it needs its own transition.
    if (statedColour) t += `${sel} ${INNER_TEXT},${sel} svg,${sel} svg *{transition:${trans.split(",")[0]}}`;
    css += `@media (prefers-reduced-motion:no-preference){${t}}`;
  }
  return css;
}

/** True when this style would render nothing — used to drop empty entries. */
export const isEmptyStyle = (s: Style | null | undefined): boolean => styleCss("x", s) === "";

/**
 * The block's per-component style overrides as one CSS string ("" when none).
 *
 * `scope` is the block's index on the page (`b.__vbi`), which `vc()` stamps
 * onto every tagged element — without it, two blocks sharing a component key
 * would style each other.
 */
export function stylesCss(b: any, scope: number): string {
  const all = b?.styles;
  if (!all || typeof all !== "object") return "";
  let css = "";
  // Shorter keys first. A component that contains another ("items" holds
  // "items.0"; "panel" holds "panelHeading") is almost always the shorter
  // name, and where two rules tie on specificity the later one wins — so the
  // inner component's own colour beats the outer one's.
  const keys = Object.keys(all).filter(isComponentKey).sort((a, b) => a.length - b.length || a.localeCompare(b));
  const used = new Set<AnimationName>();
  for (const k of keys) css += styleCss(`[data-vb-s="${scope}"][data-vb-c="${k}"]`, all[k], used);
  for (const name of used) css += `@keyframes wx-in-${name}{from{${ANIMATIONS[name]}}}`;
  return css;
}
