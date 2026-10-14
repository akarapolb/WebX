"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";
import ColorPicker from "./ColorPicker";
import {
  ALIGN_ITEMS, ANIMATIONS, EASINGS, BG_FITS, BG_POSITIONS, DIM_LIMITS, RADIUS_TOKENS, SPACE_TOKENS, isSpaceToken, type SpaceValue, SHADOW_FIELDS, DISPLAYS, FLEX_DIRECTIONS, JUSTIFY, LAYOUT_LIMITS, OVERFLOWS, DIM_UNITS, FONT_FAMILIES, SIZE_FIELDS, splitDimension, type DimUnit, GRAD_ANGLE, GRAD_TYPES, TEXT_TRANSFORMS, BG_REPEATS, BORDER_STYLES, FONT_WEIGHTS, SHADOWS, SPACE_LIMITS, SPACE_UNITS, STYLE_LIMITS,
  STATES, isBlankStyle, isTokenValue, type ComponentStyle as Style, type SpaceUnit, type StateName, type StateStyle,
} from "@/lib/componentStyle";
import { tokenInfo, type ThemeToken } from "@/lib/themeTokens";
import { PRESET_MAX, PRESET_NAME_MAX, cleanStyle, presetStyle } from "@/lib/stylePresets";
import type { PresetApi } from "@/lib/useStylePresets";
import { CUSTOM_CSS_MAX_CHARS, parseCustomCss } from "@/lib/customCss";

// The style panel for one selected component inside a block — the colour /
// spacing / background / border / effects half of the Figma-style editing that
// boxes.ts already gives move and resize.
//
// Everything here writes to `b.styles[componentKey]`, which
// public-site/templates/_builder/styles.ts turns into scoped CSS on the live
// site. That module is the security boundary: it re-validates every value, so
// this panel is free to be a plain editor and an unset field simply renders
// nothing rather than a default that would fight the template's own CSS.

/** A property, or one inside an interaction state written as "hover.bg". */
// Copy / paste between components lives for as long as the page does.
let styleClipboard: Style | null = null;

export type StyleKey = keyof Style | `${StateName}.${keyof StateStyle}`;

type Props = {
  /** What is being edited: the style itself (desktop), or that device's overrides. */
  style: Style | undefined;
  /** Which width the editor is on. Tablet and phone edit overrides that only change what they set. */
  device?: "desktop" | "tablet" | "mobile";
  /** The whole style, so a tablet or phone field can show the value it inherits. */
  full?: Style;
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
  /** Replaces the component's whole style (used by paste and by applying a preset). */
  replaceAll?: (style: Style | undefined) => void;
  /** The workspace's saved presets. */
  presets?: PresetApi;
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

// A colour row is identified by its property path ("bg", "hover.bg"), so the pickers stay mutually exclusive across modes too.
type ColorKey = string;

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
function NumRow({ label, value, min, max, step, unit, onChange, inherited }: {
  label: string; value?: number; min: number; max: number; step?: number; unit: string; onChange: (v: number | undefined) => void;
  /** What this field falls back to when empty (a tablet/phone field shows what it inherits). */
  inherited?: number;
}) {
  return (
    <div className="cs-row">
      <label>{label}</label>
      <input type="number" className="cs-num" min={min} max={max} step={step} value={value ?? ""} placeholder={inherited !== undefined ? String(inherited) : "—"}
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === "" ? undefined : Math.min(max, Math.max(min, Number(raw))));
        }} />
      <span className="cs-unit">{unit}</span>
    </div>
  );
}

/** A size: a number plus a unit, stored together as "50%". Empty = not set (the template's own size). */
function DimRow({ label, value, keyword, inherited, onChange, t }: {
  label: string; value?: string; keyword?: "auto" | "none"; inherited?: string; onChange: (v: string | undefined) => void; t: Props["t"];
}) {
  const parts = splitDimension(value);
  const isKeyword = !!keyword && value === keyword;
  const unit: string = isKeyword ? keyword! : parts?.unit ?? splitDimension(inherited)?.unit ?? "px";
  const lim = DIM_LIMITS[(DIM_UNITS as readonly string[]).includes(unit) ? (unit as DimUnit) : "px"];
  return (
    <div className="cs-row">
      <label>{label}</label>
      <input type="number" className="cs-num" min={lim.min} max={lim.max} step={lim.step} disabled={isKeyword}
        value={isKeyword ? "" : parts?.n ?? ""} placeholder={isKeyword ? keyword : splitDimension(inherited)?.n ?? "—"} aria-label={label}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") return onChange(undefined);
          const n = Math.min(lim.max, Math.max(lim.min, Number(raw)));
          onChange(Number.isFinite(n) ? n + unit : undefined);
        }} />
      <select className="cs-sel cs-dimunit" value={unit} aria-label={label + " " + t("cs.unit")}
        onChange={(e) => {
          const u = e.target.value;
          if (keyword && u === keyword) return onChange(keyword);
          onChange(parts ? parts.n + u : undefined);
        }}>
        {(DIM_UNITS as readonly string[]).map((u) => <option key={u} value={u}>{u}</option>)}
        {keyword && <option value={keyword}>{keyword}</option>}
      </select>
    </div>
  );
}

/** The four sides of padding or margin in one compact box: top, right, bottom, left. */
function SidesRow({ label, kind, unit, values, inherited, set, onScale, t }: {
  label: string; kind: "padding" | "margin"; unit: SpaceUnit;
  values: [SpaceValue | undefined, SpaceValue | undefined, SpaceValue | undefined, SpaceValue | undefined];
  inherited?: [SpaceValue | undefined, SpaceValue | undefined, SpaceValue | undefined, SpaceValue | undefined];
  set: (side: 0 | 1 | 2 | 3, v: SpaceValue | undefined) => void;
  /** Points all four sides at one step of the theme's spacing scale. */
  onScale: (token: (typeof SPACE_TOKENS)[number]) => void; t: Props["t"];
}) {
  const lim = SPACE_LIMITS[kind][unit];
  const names = [t("cs.top"), t("cs.right"), t("cs.bottom"), t("cs.left")];
  return (
    <>
    <div className="cs-row cs-sides-row">
      <label>{label}</label>
      <div className="cs-sides">
        {values.map((v, i) => isSpaceToken(v) ? (
          <label key={i} className="cs-side">
            <span>{names[i]}</span>
            <button type="button" className="cs-tokside" title={t("cs.scale.clear")} aria-label={label + " " + names[i] + " " + t("cs.scale.step") + " " + v.slice(1) + " — " + t("cs.scale.clear")}
              onClick={() => set(i as 0 | 1 | 2 | 3, undefined)}>{v.slice(1)} ×</button>
          </label>
        ) : (
          <label key={i} className="cs-side">
            <span>{names[i]}</span>
            <input type="number" min={lim.min} max={lim.max} step={lim.step} value={v ?? ""} placeholder={inherited?.[i] !== undefined ? String(inherited[i]) : "—"} aria-label={label + " " + names[i]}
              onChange={(e) => {
                const raw = e.target.value.trim();
                set(i as 0 | 1 | 2 | 3, raw === "" ? undefined : Math.min(lim.max, Math.max(lim.min, Number(raw))));
              }} />
          </label>
        ))}
      </div>
    </div>
      <div className="cs-scale" role="group" aria-label={t("cs.scale.label")}>
        <span>{t("cs.scale.label")}</span>
        {SPACE_TOKENS.map((tk) => <button type="button" key={tk} title={t("cs.scale.all") + " " + tk.slice(1)} onClick={() => onScale(tk)}>{tk.slice(1)}</button>)}
      </div>
    </>
  );
}

/** The translator does not interpolate, so "{n}"-style placeholders are filled here. */
const fill = (text: string, vars: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ""));

/** The custom CSS box: typed freely, committed when the editor leaves it (so one edit is one undo step), with a count of what the site will ignore. */
function CssBox({ value, onCommit, t }: { value?: string; onCommit: (v: string | undefined) => void; t: Props["t"] }) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  const parsed = parseCustomCss(text);
  return (
    <div className="cs-cssbox">
      <textarea className="cs-css" rows={6} maxLength={CUSTOM_CSS_MAX_CHARS} spellCheck={false} value={text}
        placeholder={"letter-spacing: .05em;\nfilter: blur(2px);\nbackdrop-filter: blur(8px);"} aria-label={t("cs.sec.css")}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text.trim() === "" ? undefined : text)} />
      {text.trim() !== "" && <p className="cs-hint">{fill(t("cs.css.count"), { ok: parsed.accepted.length, n: parsed.ignored.length })}</p>}
      {parsed.ignored.length > 0 && (
        <ul className="cs-css-ignored">
          {parsed.ignored.slice(0, 6).map((i, k) => <li key={k}><code>{i.text.slice(0, 48)}</code> — {t("cs.css.r." + i.reason)}</li>)}
          {parsed.ignored.length > 6 && <li>…</li>}
        </ul>
      )}
      <p className="cs-hint">{t("cs.css.hint")}</p>
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

/** The gradient as the panel's own preview strip; theme tokens are looked up, a missing end is transparent. */
function gradPreview(s: Style, tokens: ThemeToken[]): string {
  const css = (v?: string) => (v ? tokenInfo(tokens, v)?.value || (v.startsWith("@") ? "transparent" : v) : "transparent");
  const a = css(s.gradFrom), b = css(s.gradTo);
  return s.gradType === "radial" ? `radial-gradient(circle at center, ${a}, ${b})` : `linear-gradient(${s.gradAngle ?? GRAD_ANGLE.default}deg, ${a}, ${b})`;
}

export default function ComponentStyle({ style, device = "desktop", full, set: setRaw, reset, upload, replaceAll, presets, swatches, tokens = [], t }: Props) {
  const [presetName, setPresetName] = useState("");
  const [, bumpClip] = useState(0);
  // Light or dark: dark mode has its own overrides (style.dark), only edited on the main (desktop) look.
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const darkMode = scheme === "dark" && device === "desktop";
  const s: Style = darkMode ? ((style?.dark as Style) || {}) : style || {};
  const set = (k: StyleKey, v: any) => setRaw((darkMode ? "dark." + k : k) as StyleKey, v);
  const onDevice = device !== "desktop";
  // An override (tablet, phone or dark) can adjust how the main look's image is placed or add a gradient,
  // but the image itself, its overlay, transition and entrance belong to the main look.
  const override = onDevice || darkMode;
  // The value a tablet or phone field falls back to: the phone follows the tablet
  // override when there is one, then the style itself.
  const inh = (k: string): any => (darkMode ? (style as any)?.[k] : !onDevice ? undefined : device === "mobile" ? ((full as any)?.tablet?.[k] ?? (full as any)?.[k]) : (full as any)?.[k]);
  const fileRef = useRef<HTMLInputElement>(null);
  // Which colour picker is showing, if any. One value for all rows is what makes
  // them mutually exclusive.
  const [openPicker, setOpenPicker] = useState<ColorKey | null>(null);
  // Which look is being edited: the normal one, or one of the interaction states.
  const [mode, setMode] = useState<"normal" | StateName>("normal");
  const get = (k: string) => k.split(".").reduce((o: any, p) => (o == null ? undefined : o[p]), s as any);
  const rowProps = (k: ColorKey) => ({
    open: openPicker === k,
    // Opening switches to this row (closing whichever was open); closing only
    // clears it if it is still the one showing.
    setOpen: (o: boolean) => setOpenPicker((cur) => (o ? k : cur === k ? null : cur)),
  });
  const color = (k: ColorKey, label: string) => (
    <ColorRow label={label} value={get(k)} swatches={swatches} tokens={tokens} t={t} {...rowProps(k)}
      onChange={(v) => set(k as StyleKey, v)} onClear={() => set(k as StyleKey, undefined)} />
  );
  const [busy, setBusy] = useState(false);
  const touched = !isBlankStyle(s);
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
      <div className="cs-head" data-has-presets={presets ? "1" : undefined}>
        <b>{t("cs.title")}</b>
        {touched && <button type="button" className="cs-reset" onClick={darkMode ? () => setRaw("dark" as StyleKey, undefined) : reset}>{darkMode ? t("cs.dark.reset") : t("cs.reset")}</button>}
      </div>

      {device === "desktop" && (
        <div className="cs-states cs-scheme" role="tablist" aria-label={t("cs.scheme")}>
          {(["light", "dark"] as const).map((m) => (
            <button type="button" role="tab" key={m} aria-selected={scheme === m}
              className={(scheme === m ? "on" : "") + (m === "dark" && !isBlankStyle((style as any)?.dark) ? " has" : "")}
              onClick={() => { setScheme(m); setOpenPicker(null); }}>{t("cs.scheme." + m)}</button>
          ))}
        </div>
      )}
      {darkMode && <p className="cs-device">{t("cs.dark.hint")}</p>}
      {onDevice && <p className="cs-device">{t("cs.device." + device)}</p>}
      {!onDevice && !darkMode && (
      <div className="cs-states" role="tablist" aria-label={t("cs.states")}>
        {(["normal", ...STATES] as const).map((m) => (
          <button type="button" role="tab" key={m} aria-selected={mode === m}
            className={(mode === m ? "on" : "") + (m !== "normal" && !isBlankStyle((s as any)[m]) ? " has" : "")}
            onClick={() => { setMode(m); setOpenPicker(null); }}>{t("cs.state." + m)}</button>
        ))}
      </div>
      )}

      {!onDevice && !darkMode && mode !== "normal" ? (
        <div className="cs-state-body">
          <p className="cs-hint">{t("cs.statehint." + mode)}</p>
          {color(mode + ".color", t("cs.color"))}
          {color(mode + ".iconColor", t("cs.iconcolor"))}
          {color(mode + ".bg", t("cs.bg"))}
          {color(mode + ".gradFrom", t("cs.gradfrom"))}
          {color(mode + ".gradTo", t("cs.gradto"))}
          {color(mode + ".borderColor", t("cs.bordercolor"))}
          <NumRow label={t("cs.scale")} value={get(mode + ".scale")} inherited={s.scale} min={STYLE_LIMITS.scale.min} max={STYLE_LIMITS.scale.max} unit="%"
            onChange={(v) => set((mode + ".scale") as StyleKey, v)} />
          <NumRow label={t("cs.rotate")} value={get(mode + ".rotate")} inherited={s.rotate} min={STYLE_LIMITS.rotate.min} max={STYLE_LIMITS.rotate.max} unit="°"
            onChange={(v) => set((mode + ".rotate") as StyleKey, v)} />
          <NumRow label={t("cs.movex")} value={get(mode + ".moveX")} inherited={s.moveX} min={STYLE_LIMITS.move.min} max={STYLE_LIMITS.move.max} unit="px"
            onChange={(v) => set((mode + ".moveX") as StyleKey, v)} />
          <NumRow label={t("cs.movey")} value={get(mode + ".moveY")} inherited={s.moveY} min={STYLE_LIMITS.move.min} max={STYLE_LIMITS.move.max} unit="px"
            onChange={(v) => set((mode + ".moveY") as StyleKey, v)} />
          <div className="cs-row">
            <label>{t("cs.shadow")}</label>
            <select className="cs-sel" value={get(mode + ".shadow") ?? ""} onChange={(e) => set((mode + ".shadow") as StyleKey, e.target.value || undefined)}>
              <option value="">—</option>
              {SHADOWS.map((sh) => <option key={sh} value={sh}>{t("cs.sh." + sh)}</option>)}
            </select>
          </div>
          <div className="cs-row">
            <label>{t("cs.opacity")}</label>
            <input type="range" className="cs-range" min={STYLE_LIMITS.opacity.min} max={STYLE_LIMITS.opacity.max} value={get(mode + ".opacity") ?? 100}
              aria-label={t("cs.opacity")}
              onChange={(e) => { const v = Number(e.target.value); set((mode + ".opacity") as StyleKey, v >= 100 ? undefined : v); }} />
            <span className="cs-unit cs-pct">{get(mode + ".opacity") ?? 100}%</span>
          </div>
          {!isBlankStyle((s as any)[mode]) && (
            <button type="button" className="cs-reset" onClick={() => set(mode, undefined)}>{t("cs.state.clear")}</button>
          )}
        </div>
      ) : (
      <>
      {!override && replaceAll && (
        <Section title={t("cs.sec.presets")}>
          <div className="cs-presetbtns">
            <button type="button" disabled={!cleanStyle(style)} onClick={() => { styleClipboard = cleanStyle(style); bumpClip((n) => n + 1); }}>{t("cs.copy")}</button>
            <button type="button" disabled={!styleClipboard} title={styleClipboard ? "" : t("cs.paste.empty")}
              onClick={() => styleClipboard && replaceAll(JSON.parse(JSON.stringify(styleClipboard)))}>{t("cs.paste")}</button>
          </div>
          {presets && (
            <>
              <div className="cs-presetsave">
                <input type="text" className="cs-name" value={presetName} maxLength={PRESET_NAME_MAX} placeholder={t("cs.preset.name")} aria-label={t("cs.preset.name")}
                  onChange={(e) => setPresetName(e.target.value)} />
                <button type="button" disabled={!presetName.trim() || !cleanStyle(style) || presets.busy || presets.presets.length >= PRESET_MAX}
                  onClick={async () => { if (await presets.add(presetName, style)) setPresetName(""); }}>{t("cs.preset.save")}</button>
              </div>
              {presets.presets.length >= PRESET_MAX && <p className="cs-hint">{fill(t("cs.preset.full"), { n: PRESET_MAX })}</p>}
              {presets.error && <p className="cs-hint cs-bad">{t("cs.preset.error")}</p>}
              {presets.presets.length === 0 ? (
                <p className="cs-hint">{t("cs.preset.none")}</p>
              ) : (
                <ul className="cs-presets">
                  {presets.presets.map((p) => (
                    <li key={p.id}>
                      <span title={p.name}>{p.name}</span>
                      <button type="button" onClick={() => replaceAll(presetStyle(p))}>{t("cs.preset.apply")}</button>
                      <button type="button" className="rm" aria-label={t("cs.preset.delete") + " " + p.name} title={t("cs.preset.delete")} disabled={presets.busy} onClick={() => presets.remove(p.id)}><Icon name="trash" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="cs-hint">{t("cs.preset.hint")}</p>
            </>
          )}
        </Section>
      )}

      <Section title={t("cs.sec.colour")} defaultOpen>
        {color("color", t("cs.color"))}
        {color("iconColor", t("cs.iconcolor"))}
        {color("bg", t("cs.bg"))}
      </Section>

      <Section title={t("cs.sec.text")} defaultOpen>
        <div className="cs-row">
          <label>{t("cs.font")}</label>
          <select className="cs-sel" value={s.fontFamily ?? ""} onChange={(e) => set("fontFamily", e.target.value || undefined)}>
            <option value="">{inh("fontFamily") ? t("cs.ff." + inh("fontFamily")) : "—"}</option>
            {FONT_FAMILIES.map((f) => <option key={f} value={f}>{t("cs.ff." + f)}</option>)}
          </select>
        </div>
        <NumRow label={t("cs.fontsize")} value={s.fontSize} inherited={inh("fontSize")} min={STYLE_LIMITS.fontSize.min} max={STYLE_LIMITS.fontSize.max} unit="px"
          onChange={(v) => set("fontSize", v)} />
        <div className="cs-row">
          <label>{t("cs.weight")}</label>
          <select className="cs-sel" value={s.fontWeight ?? ""} onChange={(e) => set("fontWeight", e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">—</option>
            {FONT_WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <NumRow label={t("cs.lineheight")} value={s.lineHeight} inherited={inh("lineHeight")} min={STYLE_LIMITS.lineHeight.min} max={STYLE_LIMITS.lineHeight.max} step={STYLE_LIMITS.lineHeight.step} unit="×"
          onChange={(v) => set("lineHeight", v)} />
        <NumRow label={t("cs.letterspacing")} value={s.letterSpacing} inherited={inh("letterSpacing")} min={STYLE_LIMITS.letterSpacing.min} max={STYLE_LIMITS.letterSpacing.max} step={STYLE_LIMITS.letterSpacing.step} unit="em"
          onChange={(v) => set("letterSpacing", v)} />
        {s.letterSpacing !== undefined && s.letterSpacing > 0.08 && <p className="cs-hint">{t("cs.letterhint")}</p>}
        <div className="cs-row">
          <label>{t("cs.case")}</label>
          <select className="cs-sel" value={s.textTransform ?? ""} onChange={(e) => set("textTransform", e.target.value || undefined)}>
            <option value="">{inh("textTransform") ? t("cs.tt." + inh("textTransform")) : "—"}</option>
            {TEXT_TRANSFORMS.map((tt) => <option key={tt} value={tt}>{t("cs.tt." + tt)}</option>)}
          </select>
        </div>
        <div className="cs-row">
          <label>{t("cs.emphasis")}</label>
          <div className="cs-seg">
            <button type="button" className={s.fontStyle === "italic" ? "on" : ""} title={t("cs.italic")} aria-label={t("cs.italic")} aria-pressed={s.fontStyle === "italic"}
              onClick={() => set("fontStyle", s.fontStyle === "italic" ? undefined : "italic")}><i>I</i></button>
            <button type="button" className={s.textDecoration === "underline" ? "on" : ""} title={t("cs.underline")} aria-label={t("cs.underline")} aria-pressed={s.textDecoration === "underline"}
              onClick={() => set("textDecoration", s.textDecoration === "underline" ? undefined : "underline")}><u>U</u></button>
            <button type="button" className={s.textDecoration === "line-through" ? "on" : ""} title={t("cs.strike")} aria-label={t("cs.strike")} aria-pressed={s.textDecoration === "line-through"}
              onClick={() => set("textDecoration", s.textDecoration === "line-through" ? undefined : "line-through")}><s>S</s></button>
          </div>
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

      <Section title={t("cs.sec.size")} defaultOpen={SIZE_FIELDS.some((f) => (s as any)[f.key] !== undefined)}>
        {SIZE_FIELDS.map((f) => (
          <DimRow key={f.key} label={t("cs.dim." + f.key)} value={(s as any)[f.key]} keyword={"keyword" in f ? f.keyword : undefined}
            inherited={inh(f.key)} onChange={(v) => set(f.key, v)} t={t} />
        ))}
      </Section>

      <Section title={t("cs.sec.motion")} defaultOpen={["scale", "rotate", "moveX", "moveY", "transitionMs", "easing", "animation"].some((k) => (s as any)[k] !== undefined)}>
        <div className="cs-sub0">
          <b>{t("cs.motion.transform")}</b>
          <NumRow label={t("cs.scale")} value={s.scale} inherited={inh("scale")} min={STYLE_LIMITS.scale.min} max={STYLE_LIMITS.scale.max} unit="%" onChange={(v) => set("scale", v)} />
          <NumRow label={t("cs.rotate")} value={s.rotate} inherited={inh("rotate")} min={STYLE_LIMITS.rotate.min} max={STYLE_LIMITS.rotate.max} unit="°" onChange={(v) => set("rotate", v)} />
          <NumRow label={t("cs.movex")} value={s.moveX} inherited={inh("moveX")} min={STYLE_LIMITS.move.min} max={STYLE_LIMITS.move.max} unit="px" onChange={(v) => set("moveX", v)} />
          <NumRow label={t("cs.movey")} value={s.moveY} inherited={inh("moveY")} min={STYLE_LIMITS.move.min} max={STYLE_LIMITS.move.max} unit="px" onChange={(v) => set("moveY", v)} />
        </div>
        {!override && (
          <>
            <div className="cs-sub">
              <b>{t("cs.motion.transition")}</b>
              <p className="cs-hint">{t("cs.motion.transitionhint")}</p>
              <NumRow label={t("cs.duration")} value={s.transitionMs} min={STYLE_LIMITS.transitionMs.min} max={STYLE_LIMITS.transitionMs.max} step={50} unit="ms" inherited={180} onChange={(v) => set("transitionMs", v)} />
              <div className="cs-row">
                <label>{t("cs.easing")}</label>
                <select className="cs-sel" value={s.easing ?? ""} onChange={(e) => set("easing", e.target.value || undefined)}>
                  <option value="">{t("cs.ez.ease")}</option>
                  {EASINGS.filter((z) => z !== "ease").map((z) => <option key={z} value={z}>{t("cs.ez." + z)}</option>)}
                </select>
              </div>
            </div>
            <div className="cs-sub">
              <b>{t("cs.motion.entrance")}</b>
              <div className="cs-row">
                <label>{t("cs.animation")}</label>
                <select className="cs-sel" value={s.animation ?? ""} onChange={(e) => set("animation", e.target.value || undefined)}>
                  <option value="">—</option>
                  {ANIMATIONS.map((a) => <option key={a} value={a}>{t("cs.an." + a)}</option>)}
                </select>
              </div>
              {s.animation && (
                <>
                  <NumRow label={t("cs.duration")} value={s.animMs} min={STYLE_LIMITS.animMs.min} max={STYLE_LIMITS.animMs.max} step={100} unit="ms" inherited={600} onChange={(v) => set("animMs", v)} />
                  <NumRow label={t("cs.delay")} value={s.animDelayMs} min={STYLE_LIMITS.animDelayMs.min} max={STYLE_LIMITS.animDelayMs.max} step={100} unit="ms" inherited={0} onChange={(v) => set("animDelayMs", v)} />
                  <p className="cs-hint">{t("cs.motion.entrancehint")}</p>
                </>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title={t("cs.sec.layout")} defaultOpen={["display", "flexDirection", "justifyContent", "alignItems", "flexWrap", "gap", "gridColumns", "position", "zIndex", "overflow"].some((k) => (s as any)[k] !== undefined)}>
        {(() => {
          const eff = s.display ?? inh("display");
          const pick = (k: StyleKey, label: string, opts: readonly string[], tkey: string) => (
            <div className="cs-row">
              <label>{label}</label>
              <select className="cs-sel" value={(s as any)[k] ?? ""} onChange={(e) => set(k, e.target.value || undefined)}>
                <option value="">{inh(k as string) ? t(tkey + inh(k as string)) : "—"}</option>
                {opts.map((o) => <option key={o} value={o}>{t(tkey + o)}</option>)}
              </select>
            </div>
          );
          return (
            <>
              {pick("display", t("cs.lay.display"), DISPLAYS, "cs.disp.")}
              {s.display === "none" && <p className="cs-hint">{t("cs.lay.hidehint")}</p>}
              {(eff === "flex" || eff === "grid") && (
                <>
                  {eff === "flex" && pick("flexDirection", t("cs.lay.direction"), FLEX_DIRECTIONS, "cs.dir.")}
                  {pick("justifyContent", t("cs.lay.justify"), JUSTIFY, "cs.jc.")}
                  {pick("alignItems", t("cs.lay.align"), ALIGN_ITEMS, "cs.ai.")}
                  {eff === "flex" && (
                    <div className="cs-row">
                      <label>{t("cs.lay.wrap")}</label>
                      <div className="cs-seg">
                        {(["nowrap", "wrap"] as const).map((w) => (
                          <button type="button" key={w} className={(s.flexWrap ?? inh("flexWrap") ?? "nowrap") === w ? "on" : ""}
                            onClick={() => set("flexWrap", s.flexWrap === w ? undefined : w)}>{t("cs.wrap." + w)}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {eff === "grid" && (
                    <NumRow label={t("cs.lay.columns")} value={s.gridColumns} inherited={inh("gridColumns")} min={LAYOUT_LIMITS.gridColumns.min} max={LAYOUT_LIMITS.gridColumns.max} unit=""
                      onChange={(v) => set("gridColumns", v)} />
                  )}
                  <DimRow label={t("cs.lay.gap")} value={s.gap} inherited={inh("gap")} onChange={(v) => set("gap", v)} t={t} />
                </>
              )}
              <div className="cs-row">
                <label>{t("cs.lay.position")}</label>
                <div className="cs-seg">
                  {(["static", "relative"] as const).map((p) => (
                    <button type="button" key={p} className={(s.position ?? inh("position") ?? "static") === p ? "on" : ""}
                      onClick={() => set("position", s.position === p ? undefined : p)}>{t("cs.pos." + p)}</button>
                  ))}
                </div>
              </div>
              <NumRow label={t("cs.lay.zindex")} value={s.zIndex} inherited={inh("zIndex")} min={LAYOUT_LIMITS.zIndex.min} max={LAYOUT_LIMITS.zIndex.max} unit="" onChange={(v) => set("zIndex", v)} />
              {pick("overflow", t("cs.lay.overflow"), OVERFLOWS, "cs.ov.")}
            </>
          );
        })()}
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
          inherited={(inh("unit") ?? "px") === unit ? [inh("paddingTop"), inh("paddingRight"), inh("paddingBottom"), inh("paddingLeft")] : undefined}
          set={(i, v) => set(padKeys[i], v)} onScale={(tk) => padKeys.forEach((k) => set(k, tk))} />
        <SidesRow label={t("cs.margin")} kind="margin" unit={unit} t={t}
          values={[s.marginTop, s.marginRight, s.marginBottom, s.marginLeft]}
          inherited={(inh("unit") ?? "px") === unit ? [inh("marginTop"), inh("marginRight"), inh("marginBottom"), inh("marginLeft")] : undefined}
          set={(i, v) => set(marKeys[i], v)} onScale={(tk) => marKeys.forEach((k) => set(k, tk))} />
        {s.padding !== undefined && (
          <NumRow label={t("cs.padall")} value={s.padding} min={STYLE_LIMITS.padding.min} max={STYLE_LIMITS.padding.max} unit="px" onChange={(v) => set("padding", v)} />
        )}
      </Section>

      <Section title={t("cs.sec.border")} defaultOpen={s.borderWidth !== undefined || s.radius !== undefined}>
        <NumRow label={t("cs.borderwidth")} value={s.borderWidth} inherited={inh("borderWidth")} min={STYLE_LIMITS.borderWidth.min} max={STYLE_LIMITS.borderWidth.max} unit="px"
          onChange={(v) => set("borderWidth", v)} />
        <div className="cs-row">
          <label>{t("cs.borderstyle")}</label>
          <select className="cs-sel" value={s.borderStyle ?? ""} onChange={(e) => set("borderStyle", e.target.value || undefined)}>
            <option value="">{t("cs.bs.solid")}</option>
            {BORDER_STYLES.filter((b) => b !== "solid").map((b) => <option key={b} value={b}>{t("cs.bs." + b)}</option>)}
          </select>
        </div>
        {color("borderColor", t("cs.bordercolor"))}
        <div className="cs-row">
          <label>{t("cs.radius")}</label>
          <select className="cs-sel" value={typeof s.radius === "string" ? s.radius : s.radius === undefined ? "" : "px"}
            onChange={(e) => { const v = e.target.value; set("radius", v === "" ? undefined : v === "px" ? 0 : v); }}>
            <option value="">{inh("radius") !== undefined ? (typeof inh("radius") === "string" ? t("cs.rad." + inh("radius")) : inh("radius") + " px") : "—"}</option>
            <option value="px">{t("cs.rad.px")}</option>
            {RADIUS_TOKENS.map((r) => <option key={r} value={r}>{t("cs.rad." + r)}</option>)}
          </select>
        </div>
        {typeof s.radius === "number" && (
          <NumRow label={t("cs.rad.px")} value={s.radius} min={STYLE_LIMITS.radius.min} max={STYLE_LIMITS.radius.max} unit="px" onChange={(v) => set("radius", v)} />
        )}
      </Section>

      <Section title={t("cs.sec.effects")} defaultOpen={s.shadow !== undefined || s.opacity !== undefined || SHADOW_FIELDS.some((k) => (s as any)[k] !== undefined)}>
        <div className="cs-row">
          <label>{t("cs.shadow")}</label>
          <select className="cs-sel" value={s.shadow ?? ""} onChange={(e) => {
            // A preset and a custom shadow are alternatives: choosing one drops the other.
            if (e.target.value) for (const k of SHADOW_FIELDS) if ((s as any)[k] !== undefined) set(k, undefined);
            set("shadow", e.target.value || undefined);
          }}>
            <option value="">—</option>
            {SHADOWS.map((sh) => <option key={sh} value={sh}>{t("cs.sh." + sh)}</option>)}
          </select>
        </div>
        <div className="cs-sub">
          <b>{t("cs.shadow.custom")}</b>
          <NumRow label={t("cs.shadow.x")} value={s.shadowX} inherited={inh("shadowX")} min={STYLE_LIMITS.shadowOffset.min} max={STYLE_LIMITS.shadowOffset.max} unit="px"
            onChange={(v) => { if (v !== undefined && s.shadow) set("shadow", undefined); set("shadowX", v); }} />
          <NumRow label={t("cs.shadow.y")} value={s.shadowY} inherited={inh("shadowY")} min={STYLE_LIMITS.shadowOffset.min} max={STYLE_LIMITS.shadowOffset.max} unit="px"
            onChange={(v) => { if (v !== undefined && s.shadow) set("shadow", undefined); set("shadowY", v); }} />
          <NumRow label={t("cs.shadow.blur")} value={s.shadowBlur} inherited={inh("shadowBlur")} min={STYLE_LIMITS.shadowBlur.min} max={STYLE_LIMITS.shadowBlur.max} unit="px"
            onChange={(v) => { if (v !== undefined && s.shadow) set("shadow", undefined); set("shadowBlur", v); }} />
          <NumRow label={t("cs.shadow.spread")} value={s.shadowSpread} inherited={inh("shadowSpread")} min={STYLE_LIMITS.shadowSpread.min} max={STYLE_LIMITS.shadowSpread.max} unit="px"
            onChange={(v) => { if (v !== undefined && s.shadow) set("shadow", undefined); set("shadowSpread", v); }} />
          {color("shadowColor", t("cs.shadow.color"))}
          <div className="cs-row">
            <label>{t("cs.shadow.inset")}</label>
            <input type="checkbox" checked={s.shadowInset === true} onChange={(e) => set("shadowInset", e.target.checked ? true : undefined)} aria-label={t("cs.shadow.inset")} />
          </div>
          {SHADOW_FIELDS.some((k) => (s as any)[k] !== undefined) && (
            <button type="button" className="cs-reset" onClick={() => SHADOW_FIELDS.forEach((k) => set(k, undefined))}>{t("cs.shadow.clear")}</button>
          )}
        </div>
        <div className="cs-row">
          <label>{t("cs.opacity")}</label>
          <input type="range" className="cs-range" min={STYLE_LIMITS.opacity.min} max={STYLE_LIMITS.opacity.max} value={s.opacity ?? 100}
            aria-label={t("cs.opacity")}
            onChange={(e) => { const v = Number(e.target.value); set("opacity", v >= 100 ? undefined : v); }} />
          <span className="cs-unit cs-pct">{s.opacity ?? 100}%</span>
        </div>
      </Section>

      <Section title={t("cs.sec.gradient")} defaultOpen={!!(s.gradFrom || s.gradTo)}>
        {onDevice && <p className="cs-hint">{t("cs.gradient.devicehint")}</p>}
        <div className="cs-row">
          <label>{t("cs.gradtype")}</label>
          <div className="cs-seg">
            {GRAD_TYPES.map((g) => (
              <button type="button" key={g} className={(s.gradType ?? "linear") === g ? "on" : ""} onClick={() => set("gradType", g === "linear" ? undefined : g)}>{t("cs.gt." + g)}</button>
            ))}
          </div>
        </div>
        {color("gradFrom", t("cs.gradfrom"))}
        {color("gradTo", t("cs.gradto"))}
        {(s.gradType ?? "linear") === "linear" && (
          <div className="cs-row">
            <label>{t("cs.gradangle")}</label>
            <input type="range" className="cs-range" min={GRAD_ANGLE.min} max={GRAD_ANGLE.max} step={GRAD_ANGLE.step}
              value={s.gradAngle ?? inh("gradAngle") ?? GRAD_ANGLE.default} aria-label={t("cs.gradangle")}
              onChange={(e) => { const v = Number(e.target.value); set("gradAngle", v === GRAD_ANGLE.default && !onDevice ? undefined : v); }} />
            <span className="cs-unit cs-pct">{s.gradAngle ?? inh("gradAngle") ?? GRAD_ANGLE.default}°</span>
          </div>
        )}
        {(s.gradFrom || s.gradTo) && (
          <div className="cs-grad-preview" style={{ background: gradPreview(s, tokens) }} aria-hidden />
        )}
        {(s.gradFrom || s.gradTo || s.gradAngle !== undefined || s.gradType) && (
          <button type="button" className="cs-reset" onClick={() => { set("gradFrom", undefined); set("gradTo", undefined); set("gradAngle", undefined); set("gradType", undefined); }}>{t("cs.gradclear")}</button>
        )}
      </Section>

      <Section title={t("cs.sec.css")} defaultOpen={!!s.customCss}>
        <CssBox value={s.customCss} onCommit={(v) => set("customCss", v)} t={t} />
      </Section>

      <Section title={t("cs.sec.bgimage")} defaultOpen={!!s.bgImage || (override && !!((full as any)?.bgImage || (style as any)?.bgImage))}>
        {!override && (
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
        )}
        {(s.bgImage || (override && ((full as any)?.bgImage || (style as any)?.bgImage))) && (
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
            {!override && color("bgOverlay", t("cs.bgoverlay"))}
          </>
        )}
      </Section>
      </>
      )}
    </div>
  );
}
