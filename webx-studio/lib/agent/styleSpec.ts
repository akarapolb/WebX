// Every style property the Visual Builder's Style panel can set, as the agent may set it: what kind of value it
// takes and its limits. Mirrors what public-site/templates/_builder/styles.ts renders (which checks every value
// again before it reaches CSS) — this side exists to tell the model plainly when a value would be dropped.
// customCss is deliberately absent: free-form CSS is for a person to write, not the agent.
import { isSafeBackgroundUrl } from "./attachedImage";

type Spec =
  | { t: "colour" }
  | { t: "url" }
  | { t: "position" }
  | { t: "enum"; of: readonly string[] }
  | { t: "num"; lo: number; hi: number; int?: boolean; tokens?: readonly string[] }
  | { t: "dim"; keyword?: "auto" | "none" }
  | { t: "bool" };

const COLOUR = /^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|@(?:primary|accent|ground|ink|c[1-8]))$/;
const POSITION_ANCHORS = ["left top", "center top", "right top", "left center", "center", "right center", "left bottom", "center bottom", "right bottom"];
const PCT_POSITION = /^(\d{1,3}(?:\.\d{1,2})?)% (\d{1,3}(?:\.\d{1,2})?)%$/;
const DIM = /^(\d{1,4}(?:\.\d{1,2})?)(px|%|rem|em|vw|vh)$/;
const SPACE_TOKENS = ["@1", "@2", "@3", "@4", "@5", "@6"] as const;
const space = (lo: number): Spec => ({ t: "num", lo, hi: 400, tokens: SPACE_TOKENS });

export const STYLE_SPEC: Record<string, Spec> = {
  // colour and background
  color: { t: "colour" }, iconColor: { t: "colour" }, bg: { t: "colour" }, bgOverlay: { t: "colour" },
  bgImage: { t: "url" }, bgPosition: { t: "position" },
  bgFit: { t: "enum", of: ["cover", "contain", "auto"] },
  bgRepeat: { t: "enum", of: ["no-repeat", "repeat", "repeat-x", "repeat-y"] },
  bgAttachment: { t: "enum", of: ["scroll", "fixed"] },
  imgZoom: { t: "num", lo: 1, hi: 4 },
  gradFrom: { t: "colour" }, gradTo: { t: "colour" }, gradAngle: { t: "num", lo: 0, hi: 360, int: true },
  gradType: { t: "enum", of: ["linear", "radial"] },
  // text
  fontSize: { t: "num", lo: 8, hi: 200, int: true }, fontWeight: { t: "num", lo: 100, hi: 900, int: true },
  lineHeight: { t: "num", lo: 0.8, hi: 3 }, letterSpacing: { t: "num", lo: -0.1, hi: 0.5 },
  align: { t: "enum", of: ["left", "center", "right"] },
  fontFamily: { t: "enum", of: ["heading", "body", "mono"] },
  fontStyle: { t: "enum", of: ["normal", "italic"] },
  textDecoration: { t: "enum", of: ["none", "underline", "line-through"] },
  textTransform: { t: "enum", of: ["none", "uppercase", "lowercase", "capitalize"] },
  // spacing and size
  padding: { t: "num", lo: 0, hi: 400, int: true }, unit: { t: "enum", of: ["px", "rem", "em", "%"] },
  paddingTop: space(0), paddingRight: space(0), paddingBottom: space(0), paddingLeft: space(0),
  marginTop: space(-400), marginRight: space(-400), marginBottom: space(-400), marginLeft: space(-400),
  width: { t: "dim", keyword: "auto" }, height: { t: "dim", keyword: "auto" },
  minWidth: { t: "dim" }, minHeight: { t: "dim" }, maxWidth: { t: "dim", keyword: "none" }, maxHeight: { t: "dim", keyword: "none" },
  // layout
  display: { t: "enum", of: ["block", "flex", "grid", "inline-block", "none"] },
  flexDirection: { t: "enum", of: ["row", "column", "row-reverse", "column-reverse"] },
  justifyContent: { t: "enum", of: ["start", "center", "end", "between", "around", "evenly"] },
  alignItems: { t: "enum", of: ["start", "center", "end", "stretch", "baseline"] },
  flexWrap: { t: "enum", of: ["nowrap", "wrap"] },
  gap: { t: "dim" }, gridColumns: { t: "num", lo: 1, hi: 12, int: true },
  position: { t: "enum", of: ["static", "relative"] },
  zIndex: { t: "num", lo: -10, hi: 100, int: true },
  overflow: { t: "enum", of: ["visible", "hidden", "auto"] },
  // border and effects
  radius: { t: "num", lo: 0, hi: 999, int: true, tokens: ["@card", "@sm", "@pill"] },
  borderWidth: { t: "num", lo: 0, hi: 20 }, borderStyle: { t: "enum", of: ["solid", "dashed", "dotted", "double"] }, borderColor: { t: "colour" },
  shadow: { t: "enum", of: ["none", "sm", "md", "lg", "xl"] },
  shadowX: { t: "num", lo: -200, hi: 200 }, shadowY: { t: "num", lo: -200, hi: 200 }, shadowBlur: { t: "num", lo: 0, hi: 200 },
  shadowSpread: { t: "num", lo: -200, hi: 200 }, shadowColor: { t: "colour" }, shadowInset: { t: "bool" },
  opacity: { t: "num", lo: 0, hi: 100, int: true },
  // motion
  scale: { t: "num", lo: 25, hi: 300, int: true }, rotate: { t: "num", lo: -360, hi: 360 },
  moveX: { t: "num", lo: -400, hi: 400 }, moveY: { t: "num", lo: -400, hi: 400 },
  transitionMs: { t: "num", lo: 0, hi: 2000, int: true }, easing: { t: "enum", of: ["ease", "linear", "ease-in", "ease-out", "ease-in-out"] },
  animation: { t: "enum", of: ["fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom"] },
  animMs: { t: "num", lo: 100, hi: 3000, int: true }, animDelayMs: { t: "num", lo: 0, hi: 3000, int: true },
};

/** What a hover / focus / pressed look may change (styles.ts StateStyle): nothing that would move the layout. */
export const STATE_KEYS = new Set(["color", "iconColor", "bg", "gradFrom", "gradTo", "borderColor", "shadow", "opacity", "scale"]);
/** Where a look applies besides the main one. */
export const STYLE_VARIANTS = ["tablet", "mobile", "dark", "hover", "focus", "active"] as const;
export type StyleVariant = (typeof STYLE_VARIANTS)[number];

/** The JSON schema of one value, for the tool's parameters. */
export function specSchema(s: Spec): Record<string, any> {
  switch (s.t) {
    case "colour": return { type: ["string", "null"], description: "#rrggbb or @primary/@accent/@ground/@ink/@c1…@c8" };
    case "url": return { type: ["string", "null"], maxLength: 2000 };
    case "position": return { type: ["string", "null"], description: "\"x% y%\" (0–100) or an anchor such as \"center top\"" };
    case "enum": return { type: ["string", "null"], enum: [...s.of, null] };
    case "num": return s.tokens ? { type: ["number", "string", "null"], description: `${s.lo}–${s.hi} or ${s.tokens.join("/")}` } : { type: ["number", "null"], description: `${s.lo}–${s.hi}` };
    case "dim": return { type: ["string", "null"], description: `a number with px, %, rem, em, vw or vh${s.keyword ? ` (or "${s.keyword}")` : ""}` };
    case "bool": return { type: ["boolean", "null"] };
  }
}

/** The value as it will be stored, or the reason it cannot be. `null` clears the property. */
export function checkStyleValue(key: string, v: unknown, variant?: StyleVariant): { ok: true; value: unknown } | { ok: false; error: string } {
  const s = STYLE_SPEC[key];
  if (!s) return { ok: false, error: key === "customCss" ? `"customCss" is for a person to write in the Style panel, not the agent.` : `"${key}" is not a style property.` };
  if ((variant === "hover" || variant === "focus" || variant === "active") && !STATE_KEYS.has(key)) {
    return { ok: false, error: `"${key}" cannot change on ${variant} (only ${[...STATE_KEYS].join(", ")} can), so the layout does not jump under the pointer.` };
  }
  if (v === null) return { ok: true, value: null };
  switch (s.t) {
    case "colour":
      return typeof v === "string" && COLOUR.test(v.trim()) ? { ok: true, value: v.trim() } : { ok: false, error: `"${key}" must be a hex colour like #1a73e8 or a theme colour (@primary, @accent, @ground, @ink, @c1 … @c8).` };
    case "url":
      return isSafeBackgroundUrl(v) ? { ok: true, value: (v as string).trim() } : { ok: false, error: `"${key}" must be an https address of a picture (or the url save_attached_image returned).` };
    case "position": {
      const t = typeof v === "string" ? v.trim() : "";
      const m = PCT_POSITION.exec(t);
      if (POSITION_ANCHORS.includes(t) || (m && Number(m[1]) <= 100 && Number(m[2]) <= 100)) return { ok: true, value: t };
      return { ok: false, error: `"${key}" must be "x% y%" with both from 0 to 100, or one of: ${POSITION_ANCHORS.join(", ")}.` };
    }
    case "enum":
      return typeof v === "string" && s.of.includes(v) ? { ok: true, value: v } : { ok: false, error: `"${key}" must be one of: ${s.of.join(", ")}.` };
    case "num": {
      if (s.tokens && typeof v === "string" && s.tokens.includes(v)) return { ok: true, value: v };
      if (typeof v !== "number" || !Number.isFinite(v) || v < s.lo || v > s.hi) return { ok: false, error: `"${key}" must be a number from ${s.lo} to ${s.hi}${s.tokens ? ` or one of ${s.tokens.join(", ")}` : ""}.` };
      return { ok: true, value: s.int ? Math.round(v) : Math.round(v * 1000) / 1000 };
    }
    case "dim": {
      const t = typeof v === "string" ? v.trim() : "";
      if (s.keyword && t === s.keyword) return { ok: true, value: t };
      return DIM.test(t) ? { ok: true, value: t } : { ok: false, error: `"${key}" must be a number with a unit (px, %, rem, em, vw, vh) like "320px" or "50%"${s.keyword ? `, or "${s.keyword}"` : ""}.` };
    }
    case "bool":
      return typeof v === "boolean" ? { ok: true, value: v } : { ok: false, error: `"${key}" must be true or false.` };
  }
}
