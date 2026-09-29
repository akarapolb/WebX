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

// Same-origin in dev (both on localhost); in production this must be the
// real webx-studio origin(s). Comma-separated so a staging + prod studio
// domain can both be allowed. NEXT_PUBLIC_ vars are baked in at build time,
// same as every other public-site env var (see lib/cms.ts's own).
const ALLOWED_PARENT_ORIGINS = (process.env.NEXT_PUBLIC_STUDIO_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim());

export type PreviewMessage = { type: "webx:builder:render"; blocks: any[]; active?: number; labels?: string[]; scroll?: boolean; comp?: string | null };

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

export default function HarnessBridge({ Blocks }: { Blocks: ComponentType<{ blocks: any[]; indexOffset?: number }> }) {
  const [blocks, setBlocks] = useState<any[]>([]);
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
      setActive(typeof data.active === "number" ? data.active : -1);
      setLabels(Array.isArray(data.labels) ? data.labels : []);
      if ("comp" in data && data.comp !== lastComp.current) { lastComp.current = data.comp; setComp(data.comp ?? null); }
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
    return out;
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

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
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
    if (i !== active) return;
    const chain = chainAt(e.target, i);
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
      <div ref={rootRef} className={dragging ? "vbh-dragging" : undefined}
        onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onClickCapture={onClickCapture}
        onMouseOver={onMouseOver} onMouseLeave={() => { setHover(-1); setHoverComp(null); }}>
        {blocks.map((b, i) => (
          <div key={b?.id ? b.id + ":" + i : i} data-vb-index={i} className={i === active ? "vbh-active" : undefined} style={{ display: "contents" }}>
            <Blocks blocks={[b]} indexOffset={i} />
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
          {boxes.hovComp && hoverComp && !dragging && (
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
