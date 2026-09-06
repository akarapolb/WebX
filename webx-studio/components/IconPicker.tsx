"use client";
// A visual replacement for a bare `<select>` of icon ids — a browser can't
// render an <svg> inside an <option>, so a native select showing "i-id" /
// "i-shield" / "i-check" as plain option TEXT is the best a <select> can
// ever do here. This renders the actual glyph everywhere: on the closed
// trigger, and on every choice in the open grid.
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

export default function IconPicker({
  value, onChange, builtIn, customIcons = [], title,
}: {
  /** Current symbol id, e.g. "i-shield", or a custom icon's `key`. */
  value: string;
  onChange: (id: string) => void;
  /** Symbol ids to offer, already "i-"-prefixed by the caller — this
   * component stays agnostic of any particular icon set. */
  builtIn: string[];
  customIcons?: CustomIcon[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const custom = customIcons.find((c) => c.key === value);
  const mediaSrc = (url: string) => (url.startsWith("http") ? url : "/api/strapi" + url);

  return (
    <div className="icpick" ref={ref}>
      <button type="button" className="icpick-trig" title={title} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        {custom?.imageUrl ? <img src={mediaSrc(custom.imageUrl)} alt="" /> : <SpriteIcon id={value || builtIn[0]} />}
      </button>
      {open && (
        <div className="icpick-pop" role="listbox">
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
                    {ic.imageUrl ? <img src={mediaSrc(ic.imageUrl)} alt="" /> : <SpriteIcon id="i-grid" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
