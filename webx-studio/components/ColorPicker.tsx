"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { parseHex, toHex, rgbToHsv, hsvToRgb, cssOf, type Hsva } from "@/lib/color";

// Saturation/value square + hue and alpha sliders + hex/opacity fields, with
// an eyedropper and a row of colours already used on the page.
//
// State is held as HSV, not as the hex string the caller owns: dragging into
// the black corner or to zero saturation destroys the hue, so a round trip
// through RGB on every pointer move would make the hue slider jump back to
// red mid-drag. The hex prop is therefore only read back in when it names a
// colour different from the one we're already showing.

type Props = {
  /** Current value as #rrggbb / #rrggbbaa, or empty for "not set". */
  value?: string;
  onChange: (hex: string) => void;
  /** Clearing is offered only when the caller can represent "no colour". */
  onClear?: () => void;
  /** Colours already used on this page. */
  swatches?: string[];
  t: (k: string, v?: Record<string, any>) => string;
};

const FALLBACK: Hsva = { h: 0, s: 0, v: 1, a: 1 };

/** Pointer position within an element, as 0..1 on both axes. */
function ratio(el: HTMLElement, e: { clientX: number; clientY: number }) {
  const r = el.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width))),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / Math.max(1, r.height))),
  };
}

/**
 * Drag handling shared by all three surfaces. setPointerCapture keeps events
 * coming while the pointer leaves the element — without it a fast drag off
 * the square freezes the colour where the cursor crossed the edge.
 */
function useDrag(onMove: (el: HTMLElement, e: { clientX: number; clientY: number }) => void) {
  return useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    onMove(el, e);
    const move = (ev: PointerEvent) => onMove(el, ev);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }, [onMove]);
}

export default function ColorPicker({ value, onChange, onClear, swatches = [], t }: Props) {
  const parsed = useMemo(() => parseHex(value || ""), [value]);
  const [hsv, setHsv] = useState<Hsva>(() => (parsed ? rgbToHsv(parsed) : FALLBACK));
  // Adopt an externally-set colour, but never one that merely round-trips to
  // what we're already showing (see the note above about hue).
  const shownRef = useRef<string>(parsed ? toHex(parsed) : "");
  useEffect(() => {
    const incoming = parsed ? toHex(parsed) : "";
    if (incoming && incoming !== shownRef.current) {
      shownRef.current = incoming;
      setHsv(rgbToHsv(parsed!));
    }
  }, [parsed]);

  const emit = useCallback((next: Hsva) => {
    setHsv(next);
    const hex = toHex(hsvToRgb(next));
    shownRef.current = hex;
    onChange(hex);
  }, [onChange]);

  // The drag callbacks below are created once; they read the live value from
  // here rather than closing over a stale `hsv` from the render that made
  // them — a drag would otherwise snap back to where it started.
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  const onSv = useDrag(useCallback((el, e) => {
    const { x, y } = ratio(el, e);
    emit({ ...hsvRef.current, s: x, v: 1 - y });
  }, [emit]));
  const onHue = useDrag(useCallback((el, e) => {
    emit({ ...hsvRef.current, h: ratio(el, e).x * 360 });
  }, [emit]));
  const onAlpha = useDrag(useCallback((el, e) => {
    emit({ ...hsvRef.current, a: ratio(el, e).x });
  }, [emit]));

  const rgb = hsvToRgb(hsv);
  const hex = toHex(rgb);
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  // EyeDropper is Chromium-only; the button simply isn't offered elsewhere
  // rather than failing when pressed.
  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;
  const pickFromScreen = async () => {
    try {
      const picked = await new (window as any).EyeDropper().open();
      const c = parseHex(picked?.sRGBHex);
      if (c) emit({ ...rgbToHsv(c), a: hsv.a });
    } catch { /* the user dismissed it */ }
  };

  const commitHex = (raw: string) => {
    const c = parseHex(raw);
    setHexDraft(null);
    if (c) emit(rgbToHsv(c));
  };

  return (
    <div className="cp">
      <div className="cp-sv" onPointerDown={onSv}
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${cssOf(hsvToRgb({ h: hsv.h, s: 1, v: 1, a: 1 }))})` }}
        role="application" aria-label={t("cp.sv")}>
        <span className="cp-dot" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: cssOf({ ...rgb, a: 1 }) }} />
      </div>

      <div className="cp-rows">
        {hasEyeDropper && (
          <button type="button" className="cp-eye" onClick={pickFromScreen} title={t("cp.eyedropper")} aria-label={t("cp.eyedropper")}>
            <Icon name="drop" />
          </button>
        )}
        <div className="cp-sliders">
          <div className="cp-hue" onPointerDown={onHue} role="slider" aria-label={t("cp.hue")}
            aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)} tabIndex={0}
            onKeyDown={(e) => {
              const d = e.key === "ArrowLeft" ? -2 : e.key === "ArrowRight" ? 2 : 0;
              if (d) { e.preventDefault(); emit({ ...hsv, h: (hsv.h + d + 360) % 360 }); }
            }}>
            <span className="cp-knob" style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>
          <div className="cp-alpha cp-checker" onPointerDown={onAlpha} role="slider" aria-label={t("cp.opacity")}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.a * 100)} tabIndex={0}
            onKeyDown={(e) => {
              const d = e.key === "ArrowLeft" ? -0.02 : e.key === "ArrowRight" ? 0.02 : 0;
              if (d) { e.preventDefault(); emit({ ...hsv, a: Math.min(1, Math.max(0, hsv.a + d)) }); }
            }}>
            <div className="cp-alpha-fill" style={{ background: `linear-gradient(to right, ${cssOf({ ...rgb, a: 0 })}, ${cssOf({ ...rgb, a: 1 })})` }} />
            <span className="cp-knob" style={{ left: `${hsv.a * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="cp-fields">
        <span className="cp-tag">Hex</span>
        <input className="cp-hex" value={hexDraft ?? hex.replace("#", "").toUpperCase()}
          aria-label={t("cp.hex")} spellCheck={false}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={(e) => commitHex(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitHex(e.currentTarget.value); if (e.key === "Escape") setHexDraft(null); }} />
        <input className="cp-op" type="number" min={0} max={100} value={Math.round(hsv.a * 100)}
          aria-label={t("cp.opacity")}
          onChange={(e) => emit({ ...hsv, a: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })} />
        <span className="cp-tag">%</span>
        {onClear && (
          <button type="button" className="cp-clear" onClick={onClear} title={t("cp.clear")}>{t("cp.clear")}</button>
        )}
      </div>

      {swatches.length > 0 && (
        <div className="cp-swatches">
          <label>{t("cp.onthispage")}</label>
          <div className="cp-grid">
            {swatches.map((s) => (
              <button type="button" key={s} className={"cp-sw cp-checker" + (s === hex ? " on" : "")} title={s}
                onClick={() => { const c = parseHex(s); if (c) emit(rgbToHsv(c)); }}>
                <span style={{ background: s }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
