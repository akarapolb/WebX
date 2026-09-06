"use client";
// Renders the page's real blocks with the tenant's REAL CSS instead of the
// editor's own generic .vbk-* mockup skin — isolated in an iframe, since
// public-site's stylesheets and webx-studio's own admin CSS both define
// unscoped rules (body, a, .btn, :root tokens) that would otherwise clobber
// each other if loaded into the same document.
//
// This is now the PRIMARY editing canvas for gov-portal-template tenants,
// not just a read-only preview toggle — see VisualBuilder.tsx's `gpSupported`
// branch. Every edit-callback prop below is optional: passing none of them
// (previewMode on, or a non-gov-portal tenant that never reaches this
// component) reproduces the old fully read-only render exactly.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import IconSpriteDefs from "./IconSpriteDefs";
import PreviewBlocks from "./blocks";
import type { Path } from "./editing";

const PUBLIC_SITE = (process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || "http://localhost:3100").replace(/\/$/, "");

// Editor-only chrome (selection outline, inline-edit affordances, image
// replace overlay) — deliberately a fixed color independent of the tenant's
// own --accent/--c-primary tokens: those are custom properties defined on
// the PARENT document's :root and do not cross the iframe boundary (this
// iframe has its own independent :root, populated only by whatever loads
// inside SHELL below), so reusing a token name here would just resolve to
// nothing. `.inl` rules are a duplicate of globals.css's own (that
// stylesheet never loads inside this iframe either) — kept in sync by hand
// like everything else this file ports.
const EDITOR_CSS = `
.pvb-editable{position:relative;cursor:pointer;outline:2px solid transparent;outline-offset:2px;transition:outline-color .12s}
.pvb-editable:hover{outline-color:rgba(59,130,246,.45)}
.pvb-editable.pvb-sel{outline-color:#3b82f6}
.pvb-editable .inl{outline:none;cursor:text;border-radius:4px;transition:box-shadow .15s;min-width:14px}
.pvb-editable .inl:hover{box-shadow:0 0 0 1px rgba(59,130,246,.5)}
.pvb-editable .inl:focus{box-shadow:0 0 0 2px #3b82f6;background:rgba(59,130,246,.08)}
.pvb-editable .inl:empty::before{content:attr(data-ph);opacity:.45}
.pvb-imgwrap{position:relative;display:inline-block}
.pvb-img-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55);color:#fff;font-size:13px;font-weight:600;opacity:0;cursor:pointer;transition:opacity .12s;border-radius:inherit;text-align:center;padding:8px}
.pvb-imgwrap:hover .pvb-img-overlay{opacity:1}
.pvb-imgph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:80px;background:rgba(59,130,246,.08);border:1px dashed rgba(59,130,246,.45);color:#3b82f6;font-size:13px;border-radius:8px}
.pvb-arr-add{cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:#3b82f6;background:rgba(59,130,246,.08);border:1px dashed rgba(59,130,246,.45);border-radius:8px;padding:6px 10px;margin-top:8px}
.pvb-arr-rm{position:absolute;top:4px;right:4px;z-index:3;width:22px;height:22px;border-radius:6px;background:rgba(15,23,42,.65);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .12s;font-size:14px;line-height:1}
.pvb-arritem{position:relative}
.pvb-arritem:hover .pvb-arr-rm{opacity:1}
.pvb-iconwrap{position:relative;display:inline-flex}
.pvb-iconpick{position:absolute;inset:0;opacity:0;cursor:pointer;border:none;background:none}
.pvb-bg-overlay{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55);color:#fff;font-size:13px;font-weight:600;opacity:0;cursor:pointer;transition:opacity .12s}
.hero-bg:hover .pvb-bg-overlay,.art:hover .pvb-bg-overlay{opacity:1}
.pvb-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:50vh;padding:40px;text-align:center;color:#8a8f9c;font-family:system-ui,sans-serif}
.pvb-empty b{color:#3f4451;font-size:15px}
.pvb-empty span{font-size:13px}
`;

// Built once, not derived from props — changing an iframe's srcDoc forces a
// full reload, which would tear down the portal target on every edit.
// Content renders through the portal below instead, which re-renders
// normally like any other React subtree as blocks/homeData change.
const SHELL = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&family=Ubuntu:wght@400;500;700&display=swap" />
<link rel="stylesheet" href="${PUBLIC_SITE}/assets/design-system.css" />
<link rel="stylesheet" href="${PUBLIC_SITE}/assets/templates.css" />
<link rel="stylesheet" href="${PUBLIC_SITE}/assets/leaflet.css" />
<link rel="stylesheet" href="${PUBLIC_SITE}/assets/home.css" />
<style>${EDITOR_CSS}</style>
</head><body><div id="root"></div></body></html>`;

// A template with a hosted preview harness route (see public-site/app/
// orst/preview/page.tsx and templates/_builder/PreviewBridge.tsx) instead
// of a ported .vbk-* mockup or a same-origin srcDoc iframe. Read-only —
// inline click-to-edit needs cross-document scripting a genuinely
// cross-origin iframe can't do (srcDoc iframes are same-origin to their
// parent; `src=` ones to a different port/host are not), so the harness
// branch below never wires up onSelect/onFieldChange/etc. Sidebar-form
// editing (already built for wp:page) is unaffected — this only upgrades
// what the READ-ONLY canvas looks like while editing happens in the sidebar.
const HARNESS_PATH: Record<string, string> = { orst: "/orst/preview", royalsociety: "/royalsociety/preview" };

export default function RealPreview({
  blocks, homeData, customTypes, customIcons, collectionData, tenant, harness,
  active, onSelect, onFieldChange, onImagePick, onArrayAdd, onArrayRemove, onDeselect,
}: {
  blocks: any[]; homeData?: any; customTypes?: Record<string, any>; customIcons?: Record<string, any>;
  collectionData?: Record<number, any[]>;
  tenant?: string;
  /** Set for a template with a hosted preview harness (currently "orst" and
   * "royalsociety" — see HARNESS_PATH) — switches this component from the
   * gov-portal srcDoc/portal mechanism to an actual cross-origin `src=`
   * iframe driven by postMessage. */
  harness?: string;
  active?: number;
  onSelect?: (i: number) => void;
  onFieldChange?: (i: number, path: Path, value: any) => void;
  onImagePick?: (i: number, path: Path, file: File) => void;
  onArrayAdd?: (i: number, path: Path, item: any) => void;
  onArrayRemove?: (i: number, path: Path, k: number) => void;
  onDeselect?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const editable = !!onSelect;
  const harnessPath = harness ? HARNESS_PATH[harness] : undefined;

  const [harnessReady, setHarnessReady] = useState(false);
  const [harnessHeight, setHarnessHeight] = useState<number>(600);
  // Re-sends on every blocks change AND once harnessReady flips true (the
  // child may announce readiness before this effect's first run captured
  // it, or the iframe can reload independently of a blocks change — e.g.
  // the device-width toggle remounting it).
  useEffect(() => {
    if (!harnessPath) return;
    const win = iframeRef.current?.contentWindow;
    if (!win || !harnessReady) return;
    win.postMessage({ type: "webx:builder:render", blocks }, PUBLIC_SITE);
  }, [harnessPath, harnessReady, blocks]);
  useEffect(() => {
    if (!harnessPath) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== PUBLIC_SITE) return; // only ever trust the harness's own origin
      if (e.data?.type === "webx:harness:hello") setHarnessReady(true);
      else if (e.data?.type === "webx:harness:height" && typeof e.data.px === "number") setHarnessHeight(Math.max(200, e.data.px));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [harnessPath]);

  useEffect(() => {
    // Harness mode's iframe is genuinely cross-origin (a different port),
    // so contentDocument is inaccessible — mountNode/createPortal below are
    // a srcDoc-only mechanism and stay unused in this mode.
    if (harnessPath) return;
    const el = iframeRef.current;
    if (!el) return;
    function onLoad() {
      setMountNode(el!.contentDocument?.getElementById("root") || null);
    }
    el.addEventListener("load", onLoad);
    onLoad(); // covers the case where srcDoc already finished loading before this effect ran
    return () => el.removeEventListener("load", onLoad);
  }, [harnessPath]);

  // Two native listeners on the iframe's OWN document (not the parent's —
  // native DOM events don't cross an iframe boundary, so this can't be done
  // from outside): a background-click deselect bridge, and a capture-phase
  // guard that stops any <a> inside a block from navigating the iframe away
  // once click has become the block-selection gesture. Must ship together —
  // without the second one, the very first click near a hero/CTA button
  // navigates the whole canvas away with no easy way back.
  useEffect(() => {
    if (!mountNode || !editable) return;
    const doc = mountNode.ownerDocument;
    function onMouseDown(e: MouseEvent) {
      if (!mountNode!.contains(e.target as Node)) onDeselect?.();
    }
    function onClickCapture(e: MouseEvent) {
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (a) e.preventDefault();
    }
    // Bridges Escape out of this iframe's own document. A native keydown
    // fired while focus is inside an inline-editable field here (EditableText
    // → InlineText's plain contentEditable) reaches only THIS document's
    // window, never the parent's — a same-origin srcDoc iframe still has its
    // own independent window, and keydown doesn't cross that boundary on its
    // own. Without this, VisualBuilder's own Escape handling (closing a
    // dialog, exiting preview, exiting full screen) silently does nothing
    // while someone is mid-edit on the canvas, which is exactly when Escape
    // ("never mind, stop editing") is most likely to be reached for. Only
    // Escape is bridged, not Ctrl+Z/Ctrl+Shift+Z: those would need to first
    // preventDefault the field's own native contentEditable undo to avoid a
    // second, conflicting undo layering underneath the app's block-level one
    // — a real fix, not a one-line forward, so left as a known gap for now
    // rather than bolted on here.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      (doc.activeElement as HTMLElement | null)?.blur?.();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
    doc.addEventListener("mousedown", onMouseDown);
    doc.addEventListener("click", onClickCapture, true);
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      doc.removeEventListener("mousedown", onMouseDown);
      doc.removeEventListener("click", onClickCapture, true);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [mountNode, editable, onDeselect]);

  if (harnessPath) {
    return (
      <div className="vb-realpreview">
        <iframe ref={iframeRef} src={PUBLIC_SITE + harnessPath} title="Real preview" style={{ height: harnessHeight, border: 0, width: "100%" }}
          onLoad={() => setHarnessReady(false) /* a reload means the child's own state (and its "hello") is gone — wait for a fresh one before sending */} />
      </div>
    );
  }

  return (
    <div className="vb-realpreview">
      <iframe ref={iframeRef} srcDoc={SHELL} title="Real preview" />
      {mountNode && createPortal(
        <>
          <IconSpriteDefs />
          <PreviewBlocks blocks={blocks} homeData={homeData} customTypes={customTypes} customIcons={customIcons} collectionData={collectionData} tenant={tenant}
            active={active} onSelect={onSelect} onFieldChange={onFieldChange} onImagePick={onImagePick}
            onArrayAdd={onArrayAdd} onArrayRemove={onArrayRemove} />
        </>,
        mountNode
      )}
    </div>
  );
}
