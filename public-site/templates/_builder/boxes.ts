// Free-form component layout ("Figma-style" move/resize from the Visual
// Builder) — shared by every template's Blocks.tsx (the live site) and the
// Builder's preview harness (HarnessBridge.tsx). Pure, server-safe: no
// React, no "use client".
//
// Storage, on the block itself:
//   b.boxes = { desktop?: { [componentKey]: Box }, tablet?: {...}, mobile?: {...} }
// A Box is an OFFSET from where the template would normally put the
// component (x/y → CSS `translate`, which layers on top of any transform
// the template's own CSS/animations already use) plus optional explicit
// width/height. Offsets rather than absolute coordinates keep the
// template's own flow/responsive layout as the baseline, so an unmoved
// component — and every other breakpoint that has no boxes of its own —
// renders exactly as designed.
//
// Components are the elements a renderer tags with `vc(b, key)`: top-level
// fields ("heading", "lead", "actions"…) and individual list items
// ("items.2"). `vc` also stamps the block's page index (`b.__vbi`, injected
// by Blocks()) so the generated CSS below targets exactly one block's
// component even when two blocks share a key.

export type Box = { x?: number; y?: number; w?: number; h?: number; ib?: boolean };
export type Device = "desktop" | "tablet" | "mobile";

// Same three ranges the Builder's device toggle previews at (1280 / 800 /
// 390px wide), matched to ORST's own main breakpoints (640px, 1024px).
export const DEVICE_MEDIA: Record<Device, string> = {
  desktop: "(min-width: 1024px)",
  tablet: "(min-width: 640px) and (max-width: 1023.98px)",
  mobile: "(max-width: 639.98px)",
};
export const deviceForWidth = (w: number): Device => (w >= 1024 ? "desktop" : w >= 640 ? "tablet" : "mobile");

// Keys and numbers are interpolated into a <style> on a live site, so both
// are whitelisted/clamped here rather than trusted: a key is a plain
// identifier with an optional ".N" item index; a number is finite and
// bounded.
const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]{0,40}(\.\d{1,3})?$/;
export const isComponentKey = (k: string) => KEY_RE.test(k);
const num = (v: any, lo: number, hi: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};

/** Props that mark an element as a movable/resizable component. */
export function vc(b: any, key: string): Record<string, string> {
  const p: Record<string, string> = { "data-vb-c": key };
  if (b && Number.isInteger(b.__vbi)) p["data-vb-s"] = String(b.__vbi);
  return p;
}

function rule(scope: number, key: string, box: Box): string {
  const x = num(box.x, -4000, 4000) ?? 0, y = num(box.y, -4000, 4000) ?? 0;
  const w = num(box.w, 8, 4000), h = num(box.h, 8, 4000);
  const decl: string[] = [];
  if (x || y) decl.push(`translate:${x}px ${y}px!important`);
  if (w !== undefined) decl.push(`width:${w}px!important`, "max-width:none!important", "flex:none!important");
  if (h !== undefined) decl.push(`height:${h}px!important`, "max-height:none!important");
  if (!decl.length) return "";
  // translate/width don't apply to plain inline boxes (a <span>, <strong>,
  // <a>) — the Builder records `ib` when the element it moved was inline.
  if (box.ib) decl.push("display:inline-block!important");
  if (w !== undefined || h !== undefined) decl.push("box-sizing:border-box!important");
  return `[data-vb-s="${scope}"][data-vb-c="${key}"]{${decl.join(";")}}`;
}

/** The block's per-breakpoint component overrides as one CSS string ("" when none). */
export function boxesCss(b: any, scope: number): string {
  const all = b?.boxes;
  if (!all || typeof all !== "object") return "";
  let css = "";
  for (const d of Object.keys(DEVICE_MEDIA) as Device[]) {
    const map = all[d];
    if (!map || typeof map !== "object") continue;
    const rules = Object.keys(map).filter(isComponentKey).map((k) => (map[k] && typeof map[k] === "object" ? rule(scope, k, map[k]) : "")).filter(Boolean);
    if (rules.length) css += `@media ${DEVICE_MEDIA[d]}{${rules.join("")}}`;
  }
  return css;
}
