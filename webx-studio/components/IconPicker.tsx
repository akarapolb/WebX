"use client";
// A visual replacement for a bare `<select>` of icon ids — a browser can't
// render an <svg> inside an <option>, so a native select showing "i-id" /
// "i-shield" / "i-check" as plain option TEXT is the best a <select> can
// ever do here. This renders the actual glyph everywhere: on the closed
// trigger, and on every choice in the open grid.
//
// Three sources, in one popover: the template's built-in sprite symbols, the
// tenant's own saved icons, and the Material set. Choosing a Material icon
// saves it as one of the tenant's icons first (a page only ever carries the
// icons it actually uses — see MuiIconBrowser) and then selects it, so the
// editor never has to visit a separate screen to use one.
//
// Reuses blockPreview/IconSpriteDefs's sprite (<symbol id="i-xxx">›<use
// href="#i-xxx">) rather than inventing a second icon set — same ids
// VisualBuilder's own FEATURE_ICONS/STAT_ICONS arrays and the real public
// site already use. That sprite's <defs> only need to exist ONCE per
// document for every <use> in it to resolve, so VisualBuilder renders
// <IconSpriteDefs /> once at its own top level (this component does not
// render its own copy) — see that render site's comment for why.
import { useEffect, useRef, useState } from "react";
import { Icon as SpriteIcon } from "./blockPreview/IconSpriteDefs";
import type { CustomIcon } from "./IconManager";
import MuiIconBrowser, { type MuiPick } from "./MuiIconBrowser";
import { useLang } from "./LangProvider";
import { cms } from "@/lib/cms";
import { sanitizeIconSvg, safeViewBox } from "@/lib/iconSvg";

const ICON_UID = "api::icon.icon";
const mediaSrc = (url: string) => (url.startsWith("http") ? url : "/api/strapi" + url);

/**
 * One saved icon, drawn the way it will look on the page.
 *
 * Solid (Material) icons need `fill: currentColor; stroke: none` set INLINE:
 * the picker's own stylesheet draws sprite icons as strokes (`fill:none;
 * stroke:currentColor`), and a filled glyph drawn that way comes out as a
 * hairline outline. A line icon still draws correctly under this because the
 * sanitiser keeps its fill/stroke on a wrapping <g>, which its paths inherit
 * from before they ever reach the <svg> style.
 */
function SavedIcon({ ic }: { ic: CustomIcon }) {
  const safe = sanitizeIconSvg(ic.svg);
  if (safe) {
    return <svg viewBox={safeViewBox(ic.viewBox)} aria-hidden="true" style={{ fill: "currentColor", stroke: "none" }} dangerouslySetInnerHTML={{ __html: safe }} />;
  }
  if (ic.imageUrl) return <img src={mediaSrc(ic.imageUrl)} alt="" />;
  return <SpriteIcon id="i-grid" />;
}

/** "AccountCircle" → "mui-account-circle", plus a suffix so two workspaces can
 * each add the same icon — Icon.key is unique across the whole table. */
function keyFor(name: string): string {
  const kebab = name.replace(/([a-z\d])([A-Z])/g, "$1-$2").toLowerCase();
  return `mui-${kebab}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function IconPicker({
  value, onChange, builtIn, customIcons = [], title, onLibraryChanged,
}: {
  /** Current symbol id, e.g. "i-shield", or a custom icon's `key`. */
  value: string;
  onChange: (id: string) => void;
  /** Symbol ids to offer, already "i-"-prefixed by the caller — this
   * component stays agnostic of any particular icon set. */
  builtIn: string[];
  customIcons?: CustomIcon[];
  title?: string;
  /** Called after a Material icon is saved into the library, so the caller can
   * reload its list. Omit it and the Material option is not offered: without a
   * way to refresh, a freshly saved icon would not show up until a reload. */
  onLibraryChanged?: () => void | Promise<void>;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setBrowsing(false); }
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { setOpen(false); setBrowsing(false); } }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const custom = customIcons.find((c) => c.key === value);

  async function pickMui(p: MuiPick) {
    setErr(false);
    // Already saved? Reuse it rather than piling up a duplicate every time the
    // same glyph is chosen again.
    const existing = customIcons.find((c) => c.svg === p.svg);
    if (existing) { onChange(existing.key); setBrowsing(false); setOpen(false); return; }
    setSaving(true);
    try {
      // No tenant is sent: governance stamps the caller's own workspace over
      // anything the client supplies, so there is nothing to get wrong here.
      const key = keyFor(p.name);
      await cms.entries.create(ICON_UID, { name: p.name, key, svg: p.svg, viewBox: p.viewBox });
      await onLibraryChanged?.();
      onChange(key);
      setBrowsing(false); setOpen(false);
    } catch {
      setErr(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="icpick" ref={ref}>
      <button type="button" className="icpick-trig" title={title} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setBrowsing(false); }}>
        {custom ? <SavedIcon ic={custom} /> : <SpriteIcon id={value || builtIn[0]} />}
      </button>
      {open && (
        <div className={"icpick-pop" + (browsing ? " icpick-pop--wide" : "")} role="listbox">
          {browsing ? (
            <>
              <MuiIconBrowser onClose={() => setBrowsing(false)} onPick={pickMui} />
              {saving && <div className="muted icpick-note">{t("ic.saving")}</div>}
              {err && <div className="icpick-note icpick-err">{t("ic.saveerr")}</div>}
            </>
          ) : (
            <>
              <div className="icpick-grid">
                {builtIn.map((id) => (
                  <button key={id} type="button" role="option" aria-selected={id === value}
                    className={"icpick-opt" + (id === value ? " on" : "")} title={id}
                    onClick={() => { onChange(id); setOpen(false); }}>
                    <SpriteIcon id={id} />
                  </button>
                ))}
              </div>
              {customIcons.length > 0 && (
                <>
                  <div className="icpick-label">Custom</div>
                  <div className="icpick-grid">
                    {customIcons.map((ic) => (
                      <button key={ic.key} type="button" role="option" aria-selected={ic.key === value}
                        className={"icpick-opt" + (ic.key === value ? " on" : "")} title={ic.name}
                        onClick={() => { onChange(ic.key); setOpen(false); }}>
                        <SavedIcon ic={ic} />
                      </button>
                    ))}
                  </div>
                </>
              )}
              {onLibraryChanged && (
                <button type="button" className="icpick-more" onClick={() => setBrowsing(true)}>
                  {t("ic.frommui")} ›
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
