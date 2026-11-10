"use client";
// Shared receiving half of the Visual Builder's preview harness protocol —
// PreviewBridge.tsx (ORST) and PreviewBridgeRoyalSociety.tsx each just pass
// their own template's Blocks renderer in. See PreviewBridge.tsx for why the
// harness exists at all, and webx-studio/components/blockPreview/
// RealPreview.tsx for the sending half.
//
// Messages:
//   parent → child  webx:builder:render    { blocks, active?, labels?, scroll?, comp? }
//   child → parent  webx:harness:hello
//                   webx:harness:height    { px }
//                   webx:harness:select    { index }                     (a click on a block)
//                   webx:harness:selected  { top, height }               (where the active block sits, for the parent to scroll to)
//                   webx:harness:component { index, key | null }         (a component picked inside the active block)
//                   webx:harness:box       { index, key, device, box }   (a finished move/resize — the parent stores it)
//                   webx:harness:navigate  { path }                      (a header/footer link — the parent opens that page)
//                   webx:harness:layers    { index, layers }             (the active block's layers, outermost first, for the Layers panel)
//                   webx:harness:imgpos    { index, key, pos }           (a picture dragged to show another part of it: "x% y%")
//
// Picture position: double-click a picture in the active block (a hero photo, a slideshow, a background picture,
// a card's picture) and drag to choose which part of it shows; Esc, Enter or a double-click ends it. The position
// is saved on the component that owns the picture as its `bgPosition`, which moves both its background picture
// and the photos it shows itself (styles.ts).
//
// `hidden` in a render message lists layers switched off with the Layers panel's eye ("<block>|<kind>|<key>"). They are
// hidden here only, while editing: nothing about them is saved or reaches the real page.
//
// Selection highlight: each block renders inside its own `display: contents`
// wrapper (no box of its own, so the template's layout/CSS is untouched —
// its stylesheets use no sibling/child combinators on sections, verified
// when this was written) purely so a block index maps to real DOM nodes.
// The outlines, name tabs and resize handles are separate absolutely-
// positioned overlays portaled to <body>, never style changes on the
// template's own elements.
//
// Components (Figma-style editing): inside the ACTIVE block, elements a
// renderer tagged with vc() (templates/_builder/boxes.ts) can be picked,
// dragged and resized. Click picks the outermost component under the
// pointer (a whole card grid), double-click drills one level in (one card);
// dragging a picked component moves it even when grabbed by a child. While a
// gesture is in flight the element is styled inline (so it follows the
// pointer at 60fps without a parent round-trip); on release the result goes
// to the parent as a `box`, which stores it on the block and re-sends the
// page — at which point the inline styles are dropped and the element sits
// where boxesCss() now puts it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { deviceForWidth, type Box as SavedBox, type Device } from "./boxes";
import { imgPositionDecls } from "./styles";
import type { IconLibrary } from "./resolveIcons";

// Same-origin in dev (both on localhost); in production this must be the
// real webx-studio origin(s). Comma-separated so a staging + prod studio
// domain can both be allowed. NEXT_PUBLIC_ vars are baked in at build time,
// same as every other public-site env var (see lib/cms.ts's own).
const ALLOWED_PARENT_ORIGINS = (process.env.NEXT_PUBLIC_STUDIO_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim());

// `icons` — the workspace's saved icon library, keyed by the value a block stores
// in its `icon` field. The harness has no backend of its own, so without it a
// custom icon's key would reach BlockIcon as a bare string and draw nothing.
export type PreviewMessage = { type: "webx:builder:render"; blocks: any[]; active?: number; labels?: string[]; scroll?: boolean; comp?: string | null; icons?: IconLibrary; hidden?: string[] };

// A layer of the active block: a tagged component (vc()), a picture or shade a template marks with data-vb-layer, or
// "bg" — the section's own background (colour, picture, gradient).
export type Layer = { kind: "comp" | "layer" | "bg"; key: string; depth: number };
const LAYER_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,60}$/;
/** "<block>|<kind>|<key>" entries from the parent, as CSS that hides each one (visibility, so the layout stays put). */
export function hiddenCss(hidden: unknown): string {
  if (!Array.isArray(hidden)) return "";
  const out: string[] = [];
  for (const h of hidden.slice(0, 400)) {
    const m = typeof h === "string" ? /^(\d{1,4})\|(comp|layer|bg)\|([A-Za-z][A-Za-z0-9_.-]{0,60})$/.exec(h) : null;
    if (!m) continue;
    const [, i, kind, key] = m;
    const scope = `[data-vb-index="${i}"]`;
    if (kind === "comp") out.push(`${scope} [data-vb-s="${i}"][data-vb-c="${key}"]{visibility:hidden!important}`);
    else if (kind === "layer") out.push(`${scope} [data-vb-layer="${key}"]{visibility:hidden!important}`);
    else out.push(`${scope} [data-vb-s="${i}"][data-vb-c="section"]{background:none!important}${scope} [data-vb-s="${i}"][data-vb-c="section"]::before,${scope} [data-vb-s="${i}"][data-vb-c="section"]::after{background:none!important}`);
  }
  return out.join("\n");
}
// ---- Picture position (double-click a picture, then drag) ----
type Pan = { el: HTMLElement; kind: "img" | "bg"; key: string; nw: number; nh: number; x: number; y: number; z: number };
const ZOOM_MAX = 4;
/** The zoom a computed transform carries (the "a" of its matrix); 1 when there is none. */
export function zoomOf(transform: string | null | undefined): number {
  const m = /^matrix\(([-\d.e]+),/.exec(transform || "");
  const z = m ? Number(m[1]) : 1;
  return Number.isFinite(z) && z >= 1 ? Math.min(ZOOM_MAX, Math.round(z * 100) / 100) : 1;
}
/** A zoomed picture's box as it was before the zoom (the scale grows it about the origin), in viewport pixels. */
function unscaledRect(el: HTMLElement, z: number, ox: number, oy: number) {
  const r = el.getBoundingClientRect();
  if (z <= 1) return { left: r.left, top: r.top, width: r.width, height: r.height };
  const w = el.offsetWidth || r.width / z, h = el.offsetHeight || r.height / z;
  const px = r.left + (ox / 100) * r.width, py = r.top + (oy / 100) * r.height;
  return { left: px - (ox / 100) * w, top: py - (oy / 100) * h, width: w, height: h };
}
/** "x% y%" of a computed object-position / background-position; the centre when it is not in percent. */
export function parsePos(v: string | null | undefined): [number, number] {
  const m = /^\s*(-?[\d.]+)%\s+(-?[\d.]+)%\s*$/.exec(v || "");
  return m ? [clampPct(Number(m[1])), clampPct(Number(m[2]))] : [50, 50];
}
const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));
/**
 * How far the picture can travel, in pixels, along each axis: the part of a "cover"-sized picture that does not fit
 * in its box. Zero when the whole picture already shows (nothing to drag).
 */
export function overflowOf(boxW: number, boxH: number, nw: number, nh: number, fit: string): [number, number] {
  if (!nw || !nh || !boxW || !boxH || (fit && fit !== "cover")) return [0, 0];
  const k = Math.max(boxW / nw, boxH / nh);
  return [Math.max(0, nw * k - boxW), Math.max(0, nh * k - boxH)];
}
/** The position after a drag: dragging right shows more of the left side, so the percentage goes down. */
export function dragPos(x0: number, y0: number, dx: number, dy: number, ovX: number, ovY: number): [number, number] {
  return [ovX ? clampPct(x0 - (dx / ovX) * 100) : x0, ovY ? clampPct(y0 - (dy / ovY) * 100) : y0];
}
const bgUrl = (el: Element) => /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(el).backgroundImage || "")?.[1] || "";

/** The layers inside one block's wrapper, in page order, each with how deeply it sits inside the others. */
export function layersOf(wrap: Element, i: number): Layer[] {
  const sel = `[data-vb-s="${i}"][data-vb-c], [data-vb-layer]`;
  const out: Layer[] = [];
  wrap.querySelectorAll<HTMLElement>(sel).forEach((el) => {
    const isComp = el.hasAttribute("data-vb-c");
    const key = isComp ? el.getAttribute("data-vb-c")! : el.getAttribute("data-vb-layer")!;
    if (!LAYER_KEY.test(key)) return;
    let depth = 0;
    for (let p = el.parentElement?.closest(sel); p && wrap.contains(p); p = p.parentElement?.closest(sel)) depth++;
    out.push({ kind: isComp ? "comp" : "layer", key, depth });
    if (isComp && key === "section") out.push({ kind: "bg", key: "background", depth: depth + 1 });
  });
  return out.slice(0, 300);
}

type Rect = { top: number; left: number; width: number; height: number };
type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Gesture = {
  kind: "move" | "resize"; dir?: Dir; key: string; el: HTMLElement;
  sx: number; sy: number; base: SavedBox; w0: number; h0: number; ib: boolean; moved: boolean;
};

// Editor-only chrome — fixed colors independent of the template's tokens.
// Blue = block, violet = component (same split Figma uses for frame vs layer).
const CSS = `
.vbh-box{position:absolute;pointer-events:none;z-index:2147483000;box-sizing:border-box;border-radius:2px}
.vbh-box.sel{outline:2px solid #3b82f6;outline-offset:-2px;background:rgba(59,130,246,.03)}
.vbh-box.hov{outline:1px dashed rgba(59,130,246,.7);outline-offset:-1px}
.vbh-tag{position:absolute;right:-2px;bottom:100%;background:#3b82f6;color:#fff;font:600 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.01em;padding:5px 8px;border-radius:5px 5px 0 0;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis}
.vbh-box.inside .vbh-tag{bottom:auto;top:0;border-radius:0 0 0 5px;right:0}
.vbh-box.hov .vbh-tag{background:rgba(59,130,246,.85)}
.vbh-c{position:absolute;pointer-events:none;z-index:2147483001;box-sizing:border-box}
.vbh-c.hov{outline:1px solid rgba(139,92,246,.75);outline-offset:0}
.vbh-c.sel{outline:1.5px solid #8b5cf6;outline-offset:0}
.vbh-ctag{position:absolute;left:-1px;bottom:calc(100% + 3px);background:#8b5cf6;color:#fff;font:600 10.5px/1 ui-monospace,Menlo,Consolas,monospace;padding:4px 6px;border-radius:4px;white-space:nowrap}
.vbh-c.hov .vbh-ctag{background:rgba(139,92,246,.85)}
.vbh-size{position:absolute;left:50%;top:calc(100% + 6px);transform:translateX(-50%);background:#8b5cf6;color:#fff;font:600 10.5px/1 ui-monospace,Menlo,Consolas,monospace;padding:4px 6px;border-radius:4px;white-space:nowrap}
.vbh-h{position:absolute;width:9px;height:9px;background:#fff;border:1.5px solid #8b5cf6;border-radius:2px;pointer-events:auto;box-sizing:border-box}
.vbh-h[data-d=n],.vbh-h[data-d=s]{left:calc(50% - 4.5px);cursor:ns-resize}
.vbh-h[data-d=e],.vbh-h[data-d=w]{top:calc(50% - 4.5px);cursor:ew-resize}
.vbh-h[data-d=n],.vbh-h[data-d=ne],.vbh-h[data-d=nw]{top:-5px}
.vbh-h[data-d=s],.vbh-h[data-d=se],.vbh-h[data-d=sw]{bottom:-5px}
.vbh-h[data-d=e],.vbh-h[data-d=ne],.vbh-h[data-d=se]{right:-5px}
.vbh-h[data-d=w],.vbh-h[data-d=nw],.vbh-h[data-d=sw]{left:-5px}
.vbh-h[data-d=ne],.vbh-h[data-d=sw]{cursor:nesw-resize}
.vbh-h[data-d=nw],.vbh-h[data-d=se]{cursor:nwse-resize}
[data-vb-index]{cursor:pointer}
[data-vb-index].vbh-active [data-vb-c]{cursor:move}
.vbh-dragging,.vbh-dragging *{cursor:grabbing!important;user-select:none!important}
.vbh-pan{position:absolute;z-index:2147483002;box-sizing:border-box;outline:2px dashed #f59e0b;outline-offset:-2px;pointer-events:none;box-shadow:inset 0 0 0 9999px rgba(245,158,11,.06)}
.vbh-pan-tip{position:absolute;left:50%;top:12px;transform:translateX(-50%);background:#f59e0b;color:#111;font:600 12px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;padding:7px 11px;border-radius:8px;white-space:nowrap;max-width:94%;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 14px rgba(0,0,0,.25)}
body:has(.vbh-pan) [data-vb-index]{cursor:grab}
.vbh-pan-zoom{position:absolute;right:12px;bottom:12px;display:flex;align-items:center;gap:2px;background:#f59e0b;border-radius:9px;padding:3px;pointer-events:auto;box-shadow:0 4px 14px rgba(0,0,0,.25);font:700 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111}
.vbh-pan-zoom button{width:30px;height:30px;border:none;border-radius:7px;background:rgba(255,255,255,.55);color:#111;font:700 18px/1 system-ui,sans-serif;cursor:pointer}
.vbh-pan-zoom button:disabled{opacity:.4;cursor:default}
.vbh-pan-zoom b{min-width:48px;text-align:center}
`;
const DIRS: Dir[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

const pageRect = (r: DOMRect): Rect => ({ top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height });

function boxOf(wrap: Element | null): Rect | null {
  if (!wrap) return null;
  let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
  for (const el of Array.from(wrap.children)) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    top = Math.min(top, r.top); left = Math.min(left, r.left);
    right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
  }
  if (top === Infinity) return null;
  return { top: top + window.scrollY, left: left + window.scrollX, width: right - left, height: bottom - top };
}

function setLive(el: HTMLElement, b: SavedBox) {
  el.dataset.vbLive = "1";
  el.style.setProperty("translate", `${b.x || 0}px ${b.y || 0}px`, "important");
  if (b.w !== undefined) { el.style.setProperty("width", b.w + "px", "important"); el.style.setProperty("max-width", "none", "important"); el.style.setProperty("flex", "none", "important"); }
  if (b.h !== undefined) { el.style.setProperty("height", b.h + "px", "important"); el.style.setProperty("max-height", "none", "important"); }
  if (b.ib) el.style.setProperty("display", "inline-block", "important");
  if (b.w !== undefined || b.h !== undefined) el.style.setProperty("box-sizing", "border-box", "important");
}
function clearLive(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("[data-vb-live]").forEach((el) => {
    ["translate", "width", "max-width", "flex", "height", "max-height", "display", "box-sizing"].forEach((p) => el.style.removeProperty(p));
    delete el.dataset.vbLive;
  });
}

export default function HarnessBridge({ Blocks }: { Blocks: ComponentType<{ blocks: any[]; indexOffset?: number; customIcons?: IconLibrary }> }) {
  // Opt this route out of the scroll-reveal animation entirely.
  //
  // app/layout.tsx adds `js-reveal` to <html> before paint, which is what
  // makes base.css hide every `.reveal` until ScrollReveal's
  // IntersectionObserver marks it `.is-visible`. That observer runs once on
  // mount and unobserves as it goes — correct for a static page, wrong here:
  // this harness re-renders its blocks on every message from the Builder, so
  // each new `.reveal` element is one nothing is watching and it stays at
  // opacity:0 forever. Reported as a card grid showing up in the Builder as
  // an empty white box (its whole item grid carries the class), but it hit
  // section headings and most of RoyalSociety's blocks the same way.
  //
  // Dropping the class is the whole fix: base.css renders `.reveal` at
  // opacity:1 by default and only the `html.js-reveal` variant hides it, so
  // without it content is simply always visible — which is what an editing
  // surface wants anyway. Only this iframe is affected; the real pages keep
  // their animation.
  useEffect(() => {
    document.documentElement.classList.remove("js-reveal");
  }, []);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [icons, setIcons] = useState<IconLibrary | undefined>(undefined);
  const [active, setActive] = useState(-1);
  const [labels, setLabels] = useState<string[]>([]);
  const [hover, setHover] = useState(-1);
  const [comp, setComp] = useState<string | null>(null);
  const [hoverComp, setHoverComp] = useState<string | null>(null);
  // `selFor` — which block index `sel` was measured for, so the scroll
  // report below can't fire with a box left over from the previous selection.
  const [boxes, setBoxes] = useState<{ sel: Rect | null; selFor: number; hov: Rect | null; comp: Rect | null; hovComp: Rect | null }>(
    { sel: null, selFor: -1, hov: null, comp: null, hovComp: null });
  const [parent, setParent] = useState<{ win: Window; origin: string } | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [dragging, setDragging] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [pan, setPan] = useState<Pan | null>(null);
  const panRef = useRef<Pan | null>(null);
  panRef.current = pan;
  const panDrag = useRef<{ sx: number; sy: number; x0: number; y0: number } | null>(null);
  const [panBox, setPanBox] = useState<Rect | null>(null);
  const lastLayers = useRef("");
  const rootRef = useRef<HTMLDivElement>(null);
  const wantScroll = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const lastComp = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ALLOWED_PARENT_ORIGINS.includes(e.origin)) return; // hard origin gate — never trust an unlisted sender
      const data = e.data as PreviewMessage | undefined;
      if (data?.type !== "webx:builder:render") return;
      // The page now reflects any committed move/resize — drop the
      // in-flight inline styles (unless a gesture is still running).
      if (!gesture.current && rootRef.current) clearLive(rootRef.current);
      setBlocks(Array.isArray(data.blocks) ? data.blocks : []);
      // Only a plain object is a library; anything else clears it rather than
      // being trusted. Each definition is re-sanitised at render (BlockIcon),
      // so what arrives here is never injected as-is.
      setIcons(data.icons && typeof data.icons === "object" && !Array.isArray(data.icons) ? data.icons : undefined);
      setActive(typeof data.active === "number" ? data.active : -1);
      setLabels(Array.isArray(data.labels) ? data.labels : []);
      if ("comp" in data && data.comp !== lastComp.current) { lastComp.current = data.comp; setComp(data.comp ?? null); }
      setHidden(Array.isArray(data.hidden) ? data.hidden.filter((h) => typeof h === "string") : []);
      if (data.scroll) wantScroll.current = true;
      if (e.source && "postMessage" in e.source) setParent({ win: e.source as Window, origin: e.origin });
    }
    window.addEventListener("message", onMessage);
    // Announce readiness so the Builder knows it can start sending.
    ALLOWED_PARENT_ORIGINS.forEach((o) => { try { window.parent.postMessage({ type: "webx:harness:hello" }, o); } catch {} });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const onResize = () => setDevice(deviceForWidth(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // No local "clear the component when the block changes" here: the parent
  // owns that (it resets its own component selection per block and sends
  // `comp` alongside `active`), and clearing here too would race it.

  const post = useCallback((msg: any) => {
    if (!parent) return;
    try { parent.win.postMessage(msg, parent.origin); } catch {}
  }, [parent]);

  const wrapAt = (i: number) => (i >= 0 ? rootRef.current?.querySelector(`:scope > [data-vb-index="${i}"]`) ?? null : null);
  const compEl = (i: number, key: string | null) =>
    key && i >= 0 ? (wrapAt(i)?.querySelector<HTMLElement>(`[data-vb-s="${i}"][data-vb-c="${CSS_ESC(key)}"]`) ?? null) : null;

  // Re-measure after every render and whenever layout shifts (images/fonts
  // loading, accordions opening, the viewport width changing).
  const measure = useCallback(() => {
    const ce = compEl(active, comp), he = hoverComp !== comp ? compEl(active, hoverComp) : null;
    const next = {
      sel: boxOf(wrapAt(active)), selFor: active, hov: hover !== active ? boxOf(wrapAt(hover)) : null,
      comp: ce ? pageRect(ce.getBoundingClientRect()) : null, hovComp: he ? pageRect(he.getBoundingClientRect()) : null,
    };
    // Bail out when nothing moved — measure() runs after EVERY render, so an
    // unconditional set here would re-render forever.
    setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [active, hover, comp, hoverComp]);
  useLayoutEffect(() => { measure(); });
  // Tell the parent the active block's layers whenever they change (a new block, an added item, a re-render).
  useLayoutEffect(() => {
    if (!parent) return;
    const w = wrapAt(active);
    const layers = w ? layersOf(w, active) : [];
    const sig = active + ":" + JSON.stringify(layers);
    if (sig === lastLayers.current) return;
    lastLayers.current = sig;
    post({ type: "webx:harness:layers", index: active, layers });
  });
  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);

  // Tell the parent where the newly selected block is, so it can scroll the
  // iframe (auto-heighted, so the PARENT is what scrolls) to it. Only when
  // the parent asked (a sidebar click) — not after a click inside the
  // preview itself, which is by definition already on screen.
  useEffect(() => {
    if (!wantScroll.current || !boxes.sel || boxes.selFor !== active) return;
    wantScroll.current = false;
    post({ type: "webx:harness:selected", top: boxes.sel.top, height: boxes.sel.height });
  }, [boxes, active, post]);

  // The page chrome around the blocks (header nav, mobile menu, footer)
  // must not navigate the harness away either — a real navigation would
  // leave the Builder showing a live page its sidebar isn't editing. A
  // same-site link is handed to the parent instead, which opens that page
  // in the Builder (sidebar + preview together). Block-internal links are
  // already swallowed by onClickCapture below.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.closest("[data-vb-index]")) return;
      e.preventDefault();
      let url: URL;
      try { url = new URL(a.getAttribute("href") || "", location.href); } catch { return; }
      if (url.origin !== location.origin || url.pathname === location.pathname) return; // external, or an in-page #anchor
      post({ type: "webx:harness:navigate", path: url.pathname.replace(/\/+$/, "") || "/" });
    }
    function onDocSubmit(e: SubmitEvent) { e.preventDefault(); } // e.g. the header search box
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("submit", onDocSubmit, true);
    return () => { document.removeEventListener("click", onDocClick, true); document.removeEventListener("submit", onDocSubmit, true); };
  }, [post]);

  useEffect(() => {
    if (!parent) return;
    // Auto-size the iframe from the PARENT side — a cross-origin iframe
    // can't be measured by its parent directly, so the child reports it.
    const ro = new ResizeObserver(() => post({ type: "webx:harness:height", px: document.documentElement.scrollHeight }));
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [parent, post]);

  function indexFrom(target: EventTarget | null): number {
    const w = (target as HTMLElement | null)?.closest?.("[data-vb-index]");
    return w ? Number(w.getAttribute("data-vb-index")) : -1;
  }
  // Tagged components under `target` within block `i`, innermost first.
  function chainAt(target: EventTarget | null, i: number): string[] {
    const out: string[] = [];
    let el = (target as HTMLElement | null)?.closest?.("[data-vb-c]") as HTMLElement | null;
    while (el && el.getAttribute("data-vb-s") === String(i)) {
      out.push(el.getAttribute("data-vb-c")!);
      el = el.parentElement?.closest("[data-vb-c]") as HTMLElement | null;
    }
    // The whole section ("section") wraps everything in its block, so as the outermost it would be what every click
    // picked. It is styled from the sidebar button instead; clicking inside a block still picks the part under it.
    return out.filter((k) => k !== "section");
  }
  const savedBox = (key: string): SavedBox => ({ ...(blocks[active]?.boxes?.[device]?.[key] || {}) });
  const pickComp = (key: string | null) => { setComp(key); lastComp.current = key; post({ type: "webx:harness:component", index: active, key }); };

  function startGesture(e: React.PointerEvent | PointerEvent, key: string, kind: "move" | "resize", dir?: Dir) {
    const el = compEl(active, key);
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Keep receiving the pointer even once it leaves the iframe (a release
    // over the Builder's own UI would otherwise never reach this document,
    // leaving the gesture stuck "held").
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
    gesture.current = {
      kind, dir, key, el, sx: e.clientX, sy: e.clientY, base: savedBox(key), w0: r.width, h0: r.height,
      ib: getComputedStyle(el).display === "inline", moved: false,
    };
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const g = gesture.current;
      if (!g) return;
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      if (!g.moved) { g.moved = true; setDragging(true); }
      setLive(g.el, next(g, dx, dy, e.shiftKey));
      measure();
    }
    function onUp(e: PointerEvent) {
      const g = gesture.current;
      if (!g) return;
      gesture.current = null;
      setDragging(false);
      if (!g.moved) return;
      suppressClick.current = true;
      post({ type: "webx:harness:box", index: active, key: g.key, device, box: next(g, e.clientX - g.sx, e.clientY - g.sy, e.shiftKey) });
    }
    function onCancel() {
      if (!gesture.current) return;
      gesture.current = null;
      setDragging(false);
      if (rootRef.current) clearLive(rootRef.current); // abandon: snap back to the saved layout
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onCancel); };
  }, [active, device, measure, post]);

  // Ctrl/Cmd+Z (Shift+Z or Y = redo) pressed while this preview has the focus: the Studio's undo history is
  // what it should undo, so hand the key to it. Left alone while typing in a field of the page (native undo).
  useEffect(() => {
    function onUndoKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      post({ type: "webx:harness:undo", redo: k === "y" || e.shiftKey });
    }
    window.addEventListener("keydown", onUndoKey);
    return () => window.removeEventListener("keydown", onUndoKey);
  }, [post]);

  // Arrow keys nudge the picked component (Shift = 10px); Escape backs out
  // to the block.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!comp || active < 0) return;
      if (e.key === "Escape") { pickComp(null); return; }
      const d = e.shiftKey ? 10 : 1;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      if (!mv[e.key]) return;
      e.preventDefault();
      const b = savedBox(comp);
      const el = compEl(active, comp);
      post({ type: "webx:harness:box", index: active, key: comp, device,
        box: { ...b, x: (b.x || 0) + mv[e.key][0], y: (b.y || 0) + mv[e.key][1], ib: b.ib || (!!el && getComputedStyle(el).display === "inline") } });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- picture position ----
  /** The picture under the pointer in block `i` (topmost first), and the component it belongs to. */
  function picturesAt(x: number, y: number, i: number): { el: HTMLElement; kind: "img" | "bg"; key: string }[] {
    const wrap = wrapAt(i);
    if (!wrap) return [];
    const out: { el: HTMLElement; kind: "img" | "bg"; key: string }[] = [];
    for (const el of document.elementsFromPoint(x, y) as HTMLElement[]) {
      if (!wrap.contains(el)) continue;
      const kind = el.tagName === "IMG" ? "img" : bgUrl(el) ? "bg" : null;
      if (!kind) continue;
      const owner = el.closest(`[data-vb-s="${i}"][data-vb-c]`);
      const key = owner?.getAttribute("data-vb-c");
      if (key) out.push({ el, kind, key });
    }
    return out;
  }
  async function startPan(x: number, y: number): Promise<boolean> {
    // The topmost picture that really loaded: one that failed (a missing file) is skipped for the one under it.
    for (const hit of picturesAt(x, y, active)) {
      let nw = 0, nh = 0;
      if (hit.kind === "img") { nw = (hit.el as HTMLImageElement).naturalWidth; nh = (hit.el as HTMLImageElement).naturalHeight; }
      else {
        const img = new Image();
        img.src = bgUrl(hit.el);
        try { await img.decode(); } catch {}
        nw = img.naturalWidth; nh = img.naturalHeight;
      }
      if (!nw || !nh) continue;
      const cs = getComputedStyle(hit.el);
      const [px, py] = parsePos(hit.kind === "img" ? cs.objectPosition : cs.backgroundPosition);
      if (comp) pickComp(null);
      window.getSelection()?.removeAllRanges(); // the double-click also selected a word under the pointer
      setPan({ ...hit, nw, nh, x: px, y: py, z: hit.kind === "img" ? zoomOf(cs.transform) : 1 });
      return true;
    }
    return false;
  }
  const LIVE_PROPS = ["object-position", "background-position", "transform", "transform-origin", "clip-path"];
  function livePos(p: Pan, x: number, y: number) {
    p.el.dataset.vbPan = "1";
    if (p.kind === "bg") { p.el.style.setProperty("background-position", `${x}% ${y}%`, "important"); return; }
    // The same declarations the saved style will write (styles.ts), so what is seen while dragging is what is kept.
    for (const prop of LIVE_PROPS) p.el.style.removeProperty(prop);
    for (const decl of imgPositionDecls(`${x}% ${y}%`, p.z).split(";")) {
      const i = decl.indexOf(":");
      if (i > 0) p.el.style.setProperty(decl.slice(0, i), decl.slice(i + 1).replace(/!important$/, ""), "important");
    }
  }
  const sendPos = (p: Pan) => post({ type: "webx:harness:imgpos", index: active, key: p.key, pos: `${p.x}% ${p.y}%`, ...(p.kind === "img" ? { zoom: p.z } : {}) });
  /** Zoom in (+) or out (−) one step; a zoomed photo can then be dragged sideways as well. */
  function zoomBy(step: number) {
    const p = panRef.current;
    if (!p || p.kind !== "img") return;
    const z = Math.max(1, Math.min(ZOOM_MAX, Math.round(p.z * (step > 0 ? 1.15 : 1 / 1.15) * 100) / 100));
    if (z === p.z) return;
    p.z = z;
    livePos(p, p.x, p.y);
    setPan({ ...p });
    sendPos(p);
  }
  const endPan = useCallback(() => {
    const p = panRef.current;
    if (p) { for (const prop of ["object-position", "background-position", "transform", "transform-origin", "clip-path"]) p.el.style.removeProperty(prop); delete p.el.dataset.vbPan; }
    panDrag.current = null;
    setPan(null);
    setPanBox(null);
  }, []);
  // A picture's box while in picture mode (it can move as the page re-lays out).
  useLayoutEffect(() => {
    if (!pan) return;
    const u = unscaledRect(pan.el, pan.z, pan.x, pan.y);
    const r = { top: u.top + window.scrollY, left: u.left + window.scrollX, width: u.width, height: u.height };
    setPanBox((prev) => (prev && JSON.stringify(prev) === JSON.stringify(r) ? prev : r));
  });
  // Another block selected: picture mode ends.
  useEffect(() => { endPan(); }, [active, endPan]);
  useEffect(() => {
    if (!pan) return;
    function onMove(e: PointerEvent) {
      const p = panRef.current, d = panDrag.current;
      if (!p || !d) return;
      const r = unscaledRect(p.el, p.z, p.x, p.y);
      const cs = getComputedStyle(p.el);
      const [cx, cy] = overflowOf(r.width, r.height, p.nw, p.nh, p.kind === "img" ? cs.objectFit : (cs.backgroundSize.includes("cover") ? "cover" : cs.backgroundSize));
      // Zoomed in, the photo is bigger than its box by (zoom − 1) of it on each side as well.
      const [x, y] = dragPos(d.x0, d.y0, e.clientX - d.sx, e.clientY - d.sy, cx + r.width * (p.z - 1), cy + r.height * (p.z - 1));
      p.x = x; p.y = y;
      livePos(p, x, y);
    }
    function onUp() {
      const p = panRef.current, d = panDrag.current;
      if (!p || !d) return;
      panDrag.current = null;
      setDragging(false);
      if (p.x !== d.x0 || p.y !== d.y0) sendPos(p);
    }
    function onWheel(e: WheelEvent) {
      const p = panRef.current;
      if (!p || p.kind !== "img") return;
      const r = unscaledRect(p.el, p.z, p.x, p.y);
      if (e.clientX < r.left || e.clientX > r.left + r.width || e.clientY < r.top || e.clientY > r.top + r.height) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1 : -1);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); endPan(); } }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("keydown", onKey, true); window.removeEventListener("wheel", onWheel); };
  }, [pan, active, post, endPan]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (pan) {
      // In picture mode a press inside the picture drags it; anywhere else ends the mode.
      const r = unscaledRect(pan.el, pan.z, pan.x, pan.y);
      if (e.clientX < r.left || e.clientX > r.left + r.width || e.clientY < r.top || e.clientY > r.top + r.height) { endPan(); return; }
      e.preventDefault();
      panDrag.current = { sx: e.clientX, sy: e.clientY, x0: pan.x, y0: pan.y };
      setDragging(true);
      return;
    }
    const i = indexFrom(e.target);
    if (i < 0 || i !== active) return; // first click on a block just selects the block (see onClickCapture)
    const chain = chainAt(e.target, i);
    if (!chain.length) { if (comp) pickComp(null); return; }
    const key = comp && chain.includes(comp) ? comp : chain[chain.length - 1];
    if (key !== comp) pickComp(key);
    e.preventDefault(); // no text selection / native image drag while moving
    startGesture(e, key, "move");
  }
  function onDoubleClick(e: React.MouseEvent) {
    const i = indexFrom(e.target);
    if (pan) { endPan(); return; }
    if (i !== active) return;
    const chain = chainAt(e.target, i);
    // A double-click on a picture (or on the shade or empty space over one) starts picture mode. On a text or
    // a part of its own it still drills one level in, as before.
    const onPicture = (e.target as HTMLElement).tagName === "IMG" || !chain.length || !!(e.target as HTMLElement).closest("[data-vb-layer]");
    if (onPicture) { void startPan(e.clientX, e.clientY).then((ok) => { if (!ok) { const at = comp ? chain.indexOf(comp) : -1; if (at > 0) pickComp(chain[at - 1]); } }); return; }
    const at = comp ? chain.indexOf(comp) : -1;
    if (at > 0) pickComp(chain[at - 1]);
  }
  // Click selects the block in the Builder's sidebar. Links/buttons inside a
  // block must not navigate the harness away (there's no way back from
  // inside the Builder), so they're swallowed while this is the gesture.
  function onClickCapture(e: React.MouseEvent) {
    const i = indexFrom(e.target);
    if (i < 0) return;
    if ((e.target as HTMLElement).closest("a, button")) e.preventDefault();
    if (suppressClick.current) { suppressClick.current = false; e.stopPropagation(); return; }
    if (i !== active) post({ type: "webx:harness:select", index: i });
  }
  function onMouseOver(e: React.MouseEvent) {
    const i = indexFrom(e.target);
    setHover(i);
    if (i === active && !gesture.current) {
      const chain = chainAt(e.target, i);
      const at = comp ? chain.indexOf(comp) : -1;
      // Hover previews what a click would pick: the child one level in
      // when inside the picked component, else the outermost.
      setHoverComp(at > 0 ? chain[at - 1] : at === 0 ? null : chain[chain.length - 1] ?? null);
    } else setHoverComp(null);
  }

  const tagFor = (i: number, b: Rect) => ({ text: labels[i] || blocks[i]?.type || "", inside: b.top < 26 });

  return (
    <>
      <style>{CSS}</style>
      {hidden.length > 0 && <style>{hiddenCss(hidden)}</style>}
      <div ref={rootRef} className={dragging ? "vbh-dragging" : undefined}
        onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onClickCapture={onClickCapture}
        onMouseOver={onMouseOver} onMouseLeave={() => { setHover(-1); setHoverComp(null); }}>
        {blocks.map((b, i) => (
          <div key={b?.id ? b.id + ":" + i : i} data-vb-index={i} className={i === active ? "vbh-active" : undefined} style={{ display: "contents" }}>
            <Blocks blocks={[b]} indexOffset={i} customIcons={icons} />
          </div>
        ))}
      </div>
      {/* Portaled to <body> so no positioned ancestor (main, #app-content)
          can offset these page-coordinate boxes. */}
      {typeof document !== "undefined" && createPortal(
        <>
          {boxes.hov && (() => { const t = tagFor(hover, boxes.hov!); return (
            <div className={"vbh-box hov" + (t.inside ? " inside" : "")} style={boxes.hov}><span className="vbh-tag">{t.text}</span></div>
          ); })()}
          {boxes.sel && (() => { const t = tagFor(active, boxes.sel!); return (
            <div className={"vbh-box sel" + (t.inside ? " inside" : "")} style={boxes.sel}><span className="vbh-tag">{t.text}</span></div>
          ); })()}
          {pan && panBox && (
            <div className="vbh-pan" style={panBox} data-testid="vbh-pan">
              <span className="vbh-pan-tip">ลากเพื่อเลื่อนรูป{pan.kind === "img" ? " · ล้อเมาส์หรือ +/− เพื่อซูม" : ""} · Esc เมื่อเสร็จ</span>
              {pan.kind === "img" && (
                <span className="vbh-pan-zoom">
                  <button type="button" onClick={() => zoomBy(-1)} disabled={pan.z <= 1} aria-label="ซูมออก" data-testid="vbh-zoom-out">−</button>
                  <b>{Math.round(pan.z * 100)}%</b>
                  <button type="button" onClick={() => zoomBy(1)} disabled={pan.z >= ZOOM_MAX} aria-label="ซูมเข้า" data-testid="vbh-zoom-in">+</button>
                </span>
              )}
            </div>
          )}
          {boxes.hovComp && hoverComp && !dragging && !pan && (
            <div className="vbh-c hov" style={boxes.hovComp}><span className="vbh-ctag">{hoverComp}</span></div>
          )}
          {boxes.comp && comp && (
            <div className="vbh-c sel" style={boxes.comp}>
              <span className="vbh-ctag">{comp}</span>
              {dragging && <span className="vbh-size">{Math.round(boxes.comp.width)} × {Math.round(boxes.comp.height)}</span>}
              {DIRS.map((d) => (
                <span key={d} className="vbh-h" data-d={d}
                  onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); startGesture(e, comp, "resize", d); }} />
              ))}
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
}

// The box a gesture has produced so far, from its start state + pointer delta.
function next(g: Gesture, dx: number, dy: number, shift: boolean): SavedBox {
  const b: SavedBox = { ...g.base, ib: g.base.ib || g.ib };
  const x0 = g.base.x || 0, y0 = g.base.y || 0;
  if (g.kind === "move") {
    // Shift constrains to the dominant axis, same as Figma.
    if (shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    b.x = Math.round(x0 + dx); b.y = Math.round(y0 + dy);
    return b;
  }
  const d = g.dir || "se";
  let w = g.w0, h = g.h0, x = x0, y = y0;
  if (d.includes("e")) w = g.w0 + dx;
  if (d.includes("w")) { w = g.w0 - dx; x = x0 + dx; }
  if (d.includes("s")) h = g.h0 + dy;
  if (d.includes("n")) { h = g.h0 - dy; y = y0 + dy; }
  // Shift on a corner keeps the aspect ratio.
  if (shift && d.length === 2 && g.w0 && g.h0) { const k = Math.max(w / g.w0, h / g.h0); w = g.w0 * k; h = g.h0 * k; }
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  if (d.includes("w")) x = Math.round(x0 + (g.w0 - w));
  if (d.includes("n")) y = Math.round(y0 + (g.h0 - h));
  if (d === "e" || d === "w") return { ...b, x, y, w };
  if (d === "n" || d === "s") return { ...b, x, y, h };
  return { ...b, x, y, w, h };
}

// Keys are already whitelisted (boxes.ts isComponentKey) but a "." inside an
// attribute-selector string is fine; only quotes/backslashes would need it.
function CSS_ESC(k: string) { return k.replace(/["\\]/g, "\\$&"); }
