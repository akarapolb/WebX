"use client";
import { useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";
import ColorPicker from "./ColorPicker";
import {
  BG_FITS, BG_POSITIONS, BG_REPEATS, BORDER_STYLES, FONT_WEIGHTS, SHADOWS, SPACE_LIMITS, SPACE_UNITS, STYLE_LIMITS,
  isTokenValue, type ComponentStyle as Style, type SpaceUnit,
} from "@/lib/componentStyle";
import { tokenInfo, type ThemeToken } from "@/lib/themeTokens";

// The style panel for one selected component inside a block — the colour /
// spacing / background / border / effects half of the Figma-style editing that
// boxes.ts already gives move and resize.
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
  /** Theme colours a colour can point at instead of a hex. Empty for a workspace without a theme. */
  tokens?: ThemeToken[];
  t: (k: string, v?: Record<string, any>) => string;
};

const ALIGNS = [
  { v: "left", icon: "≡" },
  { v: "center", icon: "≡" },
  { v: "right", icon: "≡" },
] as const;

type ColorKey = "color" | "iconColor" | "bg" | "borderColor" | "bgOverlay";

/** A colour row: swatch button that opens the picker, plus a clear control. */
// Controlled: `open` and `setOpen` come from the panel, which is the only thing
// that knows how many colour rows there are. Each row keeping its own flag let
// the pickers all stay open at once, stacked on top of each other — opening one
// now closes the others.
function ColorRow({ label, value, onChange, onClear, swatches, tokens, t, open, setOpen }: {
  label: string; value?: string; onChange: (v: string) => void; onClear: () => void;
  swatches: string[]; tokens: ThemeToken[]; t: Props["t"]; open: boolean; setOpen: (o: boolean) => void;
}) {
  const tok = tokenInfo(tokens, value);
  const shown = tok ? tok.value : value;
  return (
    <div className="cs-row">
      <label>{label}</label>
      <button type="button" className={"cs-swatch cp-checker" + (open ? " on" : "")} onClick={() => setOpen(!open)}
        aria-expanded={open} title={tok ? tok.label : value || t("cs.notset")}>
        <span style={shown ? { background: shown } : undefined} className={shown ? "" : "none"} />
        <em>{tok ? t("cs.theme") + " · " + tok.label : value ? value.toUpperCase() : t("cs.notset")}</em>
      </button>
      {open && (
        <div className="cs-pop">
          {tokens.length > 0 && (
            <div className="cs-tokens" role="group" aria-label={t("cs.themecolours")}>
              <span className="cs-tokens-h">{t("cs.themecolours")}</span>
              {tokens.map((tk) => (
                <button type="button" key={tk.token} className={"cs-tok" + (value === tk.token ? " on" : "")} title={tk.token}
                  onClick={() => { onChange(tk.token); setOpen(false); }}>
                  <i style={{ background: tk.value || "transparent" }} />{tk.label}
                </button>
              ))}
            </div>
          )}
          {/* A picked token is not a hex: the picker would show white, so it is left out until the colour is a hex again. */}
          <ColorPicker value={isTokenValue(value) ? tok?.value || undefined : value} onChange={onChange} onClear={() => { onClear(); setOpen(false); }} swatches={swatches} t={t} />
        </div>
      )}
    </div>
  );
}

/** A number row that stays "unset" until the editor actually types one. */
function NumRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value?: number; min: number; max: number; step?: number; unit: string; onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="cs-row">
      <label>{label}</label>
      <input type="number" className="cs-num" min={min} max={max} step={step} value={value ?? ""} placeholder="—"
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === "" ? undefined : Math.min(max, Math.max(min, Number(raw))));
        }} />
      <span className="cs-unit">{unit}</span>
    </div>
  );
}

/** The four sides of padding or margin in one compact box: top, right, bottom, left. */
function SidesRow({ label, kind, unit, values, set, t }: {
  label: string; kind: "padding" | "margin"; unit: SpaceUnit;
  values: [number | undefined, number | undefined, number | undefined, number | undefined];
  set: (side: 0 | 1 | 2 | 3, v: number | undefined) => void; t: Props["t"];
}) {
  const lim = SPACE_LIMITS[kind][unit];
  const names = [t("cs.top"), t("cs.right"), t("cs.bottom"), t("cs.left")];
  return (
    <div className="cs-row cs-sides-row">
      <label>{label}</label>
      <div className="cs-sides">
        {values.map((v, i) => (
          <label key={i} className="cs-side">
            <span>{names[i]}</span>
            <input type="number" min={lim.min} max={lim.max} step={lim.step} value={v ?? ""} placeholder="—" aria-label={label + " " + names[i]}
              onChange={(e) => {
                const raw = e.target.value.trim();
                set(i as 0 | 1 | 2 | 3, raw === "" ? undefined : Math.min(lim.max, Math.max(lim.min, Number(raw))));
              }} />
          </label>
        ))}
      </div>
    </div>
  );
}

/** A collapsible group so a panel with this many controls stays scannable. */
function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="cs-sec" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="cs-sec-body">{children}</div>
    </details>
  );
}

export default function ComponentStyle({ style, set, reset, upload, swatches, tokens = [], t }: Props) {
  const s = style || {};
  const fileRef = useRef<HTMLInputElement>(null);
  // Which colour picker is showing, if any. One value for all rows is what makes
  // them mutually exclusive.
  const [openPicker, setOpenPicker] = useState<ColorKey | null>(null);
  const rowProps = (k: ColorKey) => ({
    open: openPicker === k,
    // Opening switches to this row (closing whichever was open); closing only
    // clears it if it is still the one showing.
    setOpen: (o: boolean) => setOpenPicker((cur) => (o ? k : cur === k ? null : cur)),
  });
  const color = (k: ColorKey, label: string) => (
    <ColorRow label={label} value={s[k]} swatches={swatches} tokens={tokens} t={t} {...rowProps(k)}
      onChange={(v) => set(k, v)} onClear={() => set(k, undefined)} />
  );
  const [busy, setBusy] = useState(false);
  const touched = Object.keys(s).some((k) => (s as any)[k] !== undefined && (s as any)[k] !== "");
  const unit: SpaceUnit = (SPACE_UNITS as readonly string[]).includes(s.unit as string) ? (s.unit as SpaceUnit) : "px";
  const anySpacing = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft"].some((k) => (s as any)[k] !== undefined);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try { await upload(f); } finally { setBusy(false); }
  }

  const padKeys = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const;
  const marKeys = ["marginTop", "marginRight", "marginBottom", "marginLeft"] as const;

  return (
    <div className="cs">
      <div className="cs-head">
        <b>{t("cs.title")}</b>
        {touched && <button type="button" className="cs-reset" onClick={reset}>{t("cs.reset")}</button>}
      </div>

      <Section title={t("cs.sec.colour")} defaultOpen>
        {color("color", t("cs.color"))}
        {color("iconColor", t("cs.iconcolor"))}
        {color("bg", t("cs.bg"))}
      </Section>

      <Section title={t("cs.sec.text")} defaultOpen>
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
      </Section>

      <Section title={t("cs.sec.spacing")} defaultOpen={anySpacing || s.padding !== undefined}>
        <div className="cs-row">
          <label>{t("cs.unit")}</label>
          <div className="cs-seg">
            {SPACE_UNITS.map((u) => (
              <button type="button" key={u} className={unit === u ? "on" : ""} onClick={() => set("unit", u === "px" ? undefined : u)}>{u}</button>
            ))}
          </div>
        </div>
        <SidesRow label={t("cs.padding")} kind="padding" unit={unit} t={t}
          values={[s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft]}
          set={(i, v) => set(padKeys[i], v)} />
        <SidesRow label={t("cs.margin")} kind="margin" unit={unit} t={t}
          values={[s.marginTop, s.marginRight, s.marginBottom, s.marginLeft]}
          set={(i, v) => set(marKeys[i], v)} />
        {s.padding !== undefined && (
          <NumRow label={t("cs.padall")} value={s.padding} min={STYLE_LIMITS.padding.min} max={STYLE_LIMITS.padding.max} unit="px" onChange={(v) => set("padding", v)} />
        )}
      </Section>

      <Section title={t("cs.sec.border")} defaultOpen={s.borderWidth !== undefined || s.radius !== undefined}>
        <NumRow label={t("cs.borderwidth")} value={s.borderWidth} min={STYLE_LIMITS.borderWidth.min} max={STYLE_LIMITS.borderWidth.max} unit="px"
          onChange={(v) => set("borderWidth", v)} />
        <div className="cs-row">
          <label>{t("cs.borderstyle")}</label>
          <select className="cs-sel" value={s.borderStyle ?? ""} onChange={(e) => set("borderStyle", e.target.value || undefined)}>
            <option value="">{t("cs.bs.solid")}</option>
            {BORDER_STYLES.filter((b) => b !== "solid").map((b) => <option key={b} value={b}>{t("cs.bs." + b)}</option>)}
          </select>
        </div>
        {color("borderColor", t("cs.bordercolor"))}
        <NumRow label={t("cs.radius")} value={s.radius} min={STYLE_LIMITS.radius.min} max={STYLE_LIMITS.radius.max} unit="px" onChange={(v) => set("radius", v)} />
      </Section>

      <Section title={t("cs.sec.effects")} defaultOpen={s.shadow !== undefined || s.opacity !== undefined}>
        <div className="cs-row">
          <label>{t("cs.shadow")}</label>
          <select className="cs-sel" value={s.shadow ?? ""} onChange={(e) => set("shadow", e.target.value || undefined)}>
            <option value="">—</option>
            {SHADOWS.map((sh) => <option key={sh} value={sh}>{t("cs.sh." + sh)}</option>)}
          </select>
        </div>
        <div className="cs-row">
          <label>{t("cs.opacity")}</label>
          <input type="range" className="cs-range" min={STYLE_LIMITS.opacity.min} max={STYLE_LIMITS.opacity.max} value={s.opacity ?? 100}
            aria-label={t("cs.opacity")}
            onChange={(e) => { const v = Number(e.target.value); set("opacity", v >= 100 ? undefined : v); }} />
          <span className="cs-unit cs-pct">{s.opacity ?? 100}%</span>
        </div>
      </Section>

      <Section title={t("cs.sec.bgimage")} defaultOpen={!!s.bgImage}>
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
          <>
            <div className="cs-row">
              <label>{t("cs.bgfit")}</label>
              <div className="cs-seg">
                {BG_FITS.map((f) => (
                  <button type="button" key={f} className={(s.bgFit ?? "cover") === f ? "on" : ""} onClick={() => set("bgFit", f === "cover" ? undefined : f)}>{t("cs.fit." + f)}</button>
                ))}
              </div>
            </div>
            <div className="cs-row">
              <label>{t("cs.bgposition")}</label>
              <div className="cs-pos" role="group" aria-label={t("cs.bgposition")}>
                {BG_POSITIONS.map((p) => (
                  <button type="button" key={p} className={(s.bgPosition ?? "center") === p ? "on" : ""} title={p}
                    aria-label={p} aria-pressed={(s.bgPosition ?? "center") === p}
                    onClick={() => set("bgPosition", p === "center" ? undefined : p)}><i /></button>
                ))}
              </div>
            </div>
            <div className="cs-row">
              <label>{t("cs.bgrepeat")}</label>
              <select className="cs-sel" value={s.bgRepeat ?? ""} onChange={(e) => set("bgRepeat", e.target.value || undefined)}>
                <option value="">{t("cs.rp.no-repeat")}</option>
                {BG_REPEATS.filter((r) => r !== "no-repeat").map((r) => <option key={r} value={r}>{t("cs.rp." + r)}</option>)}
              </select>
            </div>
            <div className="cs-row">
              <label>{t("cs.bgattach")}</label>
              <div className="cs-seg">
                {(["scroll", "fixed"] as const).map((a) => (
                  <button type="button" key={a} className={(s.bgAttachment ?? "scroll") === a ? "on" : ""} onClick={() => set("bgAttachment", a === "scroll" ? undefined : a)}>{t("cs.at." + a)}</button>
                ))}
              </div>
            </div>
            {color("bgOverlay", t("cs.bgoverlay"))}
          </>
        )}
      </Section>
    </div>
  );
}
