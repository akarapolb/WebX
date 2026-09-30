"use client";
import { useRef, useState } from "react";
import Icon from "./Icon";
import ColorPicker from "./ColorPicker";
import { FONT_WEIGHTS, STYLE_LIMITS, type ComponentStyle as Style } from "@/lib/componentStyle";

// The style panel for one selected component inside a block — the colour /
// size / background half of the Figma-style editing that boxes.ts already
// gives move and resize.
//
// Everything here writes to `b.styles[componentKey]`, which
// public-site/templates/_builder/styles.ts turns into scoped CSS on the live
// site. That module is the security boundary: it re-validates every value, so
// this panel is free to be a plain editor and an unset field simply renders
// nothing rather than a default that would fight the template's own CSS.

export type StyleKey = keyof Style;

type Props = {
  style: Style | undefined;
  /** Writes one property; `undefined` clears it back to the template's own. */
  set: (k: StyleKey, v: any) => void;
  /** Drops every property at once. */
  reset: () => void;
  /**
   * Uploads a file and writes its URL into this component's `bgImage`. The
   * caller does the write rather than returning a URL here, because the
   * engine-aware upload helper it already owns writes straight to a block
   * path (and a Strapi page would store a media relation, not a string).
   */
  upload: (f: File) => Promise<void>;
  swatches: string[];
  t: (k: string, v?: Record<string, any>) => string;
};

const ALIGNS = [
  { v: "left", icon: "≡" },
  { v: "center", icon: "≡" },
  { v: "right", icon: "≡" },
] as const;

/** A colour row: swatch button that opens the picker, plus a clear control. */
function ColorRow({ label, value, onChange, onClear, swatches, t }: {
  label: string; value?: string; onChange: (hex: string) => void; onClear: () => void;
  swatches: string[]; t: Props["t"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cs-row">
      <label>{label}</label>
      <button type="button" className={"cs-swatch cp-checker" + (open ? " on" : "")} onClick={() => setOpen(!open)}
        aria-expanded={open} title={value || t("cs.notset")}>
        <span style={value ? { background: value } : undefined} className={value ? "" : "none"} />
        <em>{value ? value.toUpperCase() : t("cs.notset")}</em>
      </button>
      {open && (
        <div className="cs-pop">
          <ColorPicker value={value} onChange={onChange} onClear={() => { onClear(); setOpen(false); }} swatches={swatches} t={t} />
        </div>
      )}
    </div>
  );
}

/** A number row that stays "unset" until the editor actually types one. */
function NumRow({ label, value, min, max, unit, onChange }: {
  label: string; value?: number; min: number; max: number; unit: string; onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="cs-row">
      <label>{label}</label>
      <input type="number" className="cs-num" min={min} max={max} value={value ?? ""} placeholder="—"
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === "" ? undefined : Math.min(max, Math.max(min, Number(raw))));
        }} />
      <span className="cs-unit">{unit}</span>
    </div>
  );
}

export default function ComponentStyle({ style, set, reset, upload, swatches, t }: Props) {
  const s = style || {};
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const touched = Object.keys(s).some((k) => (s as any)[k] !== undefined && (s as any)[k] !== "");

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try { await upload(f); } finally { setBusy(false); }
  }

  return (
    <div className="cs">
      <div className="cs-head">
        <b>{t("cs.title")}</b>
        {touched && <button type="button" className="cs-reset" onClick={reset}>{t("cs.reset")}</button>}
      </div>

      <ColorRow label={t("cs.color")} value={s.color} swatches={swatches} t={t}
        onChange={(v) => set("color", v)} onClear={() => set("color", undefined)} />
      <ColorRow label={t("cs.iconcolor")} value={s.iconColor} swatches={swatches} t={t}
        onChange={(v) => set("iconColor", v)} onClear={() => set("iconColor", undefined)} />
      <ColorRow label={t("cs.bg")} value={s.bg} swatches={swatches} t={t}
        onChange={(v) => set("bg", v)} onClear={() => set("bg", undefined)} />

      <NumRow label={t("cs.fontsize")} value={s.fontSize} min={STYLE_LIMITS.fontSize.min} max={STYLE_LIMITS.fontSize.max} unit="px"
        onChange={(v) => set("fontSize", v)} />

      <div className="cs-row">
        <label>{t("cs.weight")}</label>
        <select className="cs-sel" value={s.fontWeight ?? ""} onChange={(e) => set("fontWeight", e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">—</option>
          {FONT_WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>

      <div className="cs-row">
        <label>{t("cs.align")}</label>
        <div className="cs-seg">
          {ALIGNS.map((a) => (
            <button type="button" key={a.v} className={s.align === a.v ? "on" : ""}
              aria-label={t("cs.align." + a.v)} title={t("cs.align." + a.v)}
              onClick={() => set("align", s.align === a.v ? undefined : a.v)}>
              <span className={"cs-al cs-al-" + a.v} />
            </button>
          ))}
        </div>
      </div>

      <NumRow label={t("cs.radius")} value={s.radius} min={STYLE_LIMITS.radius.min} max={STYLE_LIMITS.radius.max} unit="px" onChange={(v) => set("radius", v)} />
      <NumRow label={t("cs.padding")} value={s.padding} min={STYLE_LIMITS.padding.min} max={STYLE_LIMITS.padding.max} unit="px" onChange={(v) => set("padding", v)} />

      <div className="cs-row cs-bgimg">
        <label>{t("cs.bgimage")}</label>
        <div className="cs-bgimg-c">
          {s.bgImage && <span className="cs-thumb" style={{ backgroundImage: `url("${s.bgImage}")` }} />}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="img" />{busy ? t("cs.uploading") : s.bgImage ? t("cs.replace") : t("cs.upload")}
          </button>
          {s.bgImage && <button type="button" className="rm" onClick={() => set("bgImage", undefined)}><Icon name="trash" /></button>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {s.bgImage && (
        <div className="cs-row">
          <label>{t("cs.bgfit")}</label>
          <div className="cs-seg">
            {(["cover", "contain"] as const).map((f) => (
              <button type="button" key={f} className={(s.bgFit ?? "cover") === f ? "on" : ""} onClick={() => set("bgFit", f)}>{t("cs.fit." + f)}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
