"use client";
// Font chooser for Branding → Theme: the four fonts bundled with the site plus
// every Google font. A native <select> cannot hold ~2,000 entries, search them
// or flag Thai support, so this is a small searchable popover.
//
// A Google font is stored as "google:<Family>". It is NOT loaded from Google by
// visitors: the site-builder downloads it at build time and serves it from the
// site's own origin (public-site/scripts/google-fonts.mjs). Only this admin
// screen talks to Google (for the live preview).
//
// Most Google fonts have no Thai glyphs (about 34 of ~1,980 do), and a Thai site
// would then draw its Thai text in the fallback font. So the list starts on
// "Thai support only", and a font without Thai says so.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "./LangProvider";
import { FONT_OPTIONS } from "@/lib/theme";
import { fontSuggestion, googleFamilyOf, googleKey, type CatalogFont } from "@/lib/googleFonts";

const SHOWN = 120;
const CATS = ["sans-serif", "serif", "display", "handwriting", "monospace"] as const;

export default function FontPicker({
  value, onChange, label, catalog, catalogError,
}: {
  value: string;
  onChange: (key: string) => void;
  label: string;
  /** null while loading. */
  catalog: CatalogFont[] | null;
  catalogError?: boolean;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [thaiOnly, setThaiOnly] = useState(true);
  const [cat, setCat] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const family = googleFamilyOf(value);
  const current = family ? catalog?.find((f) => f.f === family) : undefined;
  const builtIn = FONT_OPTIONS.find((f) => f.key === value);
  const currentName = family ?? builtIn?.label ?? value;
  const noThai = !!family && !!current && current.t === 0;

  const matches = useMemo(() => {
    if (!catalog) return [];
    const needle = q.trim().toLowerCase();
    return catalog.filter((f) => (!thaiOnly || f.t === 1) && (!cat || f.c === cat) && (!needle || f.f.toLowerCase().includes(needle)));
  }, [catalog, q, thaiOnly, cat]);

  // Typing the name of a font that cannot be hosted (Calibri, Times New Roman,
  // TH Sarabun New …) offers the free substitute instead of "no results".
  const byName = useMemo(() => new Map((catalog ?? []).map((f) => [f.f, f])), [catalog]);
  const suggestion = useMemo(() => (catalog ? fontSuggestion(q, new Set(byName.keys())) : null), [q, catalog, byName]);

  const pick = (key: string) => { onChange(key); setOpen(false); };
  const showBuiltIn = !q.trim() && !cat;

  return (
    <div className="fontpick" ref={ref} style={{ position: "relative" }}>
      <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{label}</span>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--panel)", color: "var(--ink)", cursor: "pointer" }}>
        <span>{currentName}</span>
        <span className="muted" style={{ fontSize: 12 }}>{family ? "Google" : t("th.fbuiltin")} ▾</span>
      </button>
      {noThai && <div className="muted" style={{ fontSize: 12.5, marginTop: 4, color: "var(--warn, #b8860b)" }}>{t("th.fnothai")}</div>}
      {family && current && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t("th.fweights")}: {current.w.join(", ")}</div>}

      {open && (
        <div role="listbox" style={{ position: "absolute", zIndex: 30, left: 0, right: 0, marginTop: 4, background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.35)", padding: 10 }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("th.fsearch")} aria-label={t("th.fsearch")}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--sunk)", color: "var(--ink)" }} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0", flexWrap: "wrap", fontSize: 12.5 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={thaiOnly} onChange={(e) => setThaiOnly(e.target.checked)} /> {t("th.fthaionly")}
            </label>
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t("th.fcategory")} style={{ padding: "3px 6px" }}>
              <option value="">{t("th.fallcats")}</option>
              {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {catalog && <span className="muted">{matches.length.toLocaleString()} / {catalog.length.toLocaleString()}</span>}
          </div>

          {suggestion && (
            <div style={{ margin: "0 0 8px", padding: 10, borderRadius: 8, border: "1px solid var(--line2)", background: "var(--sunk)", fontSize: 13 }}>
              <div>{t(suggestion.kind === "metric" ? "th.frecmetric" : "th.frecsimilar").replace("{name}", suggestion.typed)}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {suggestion.families.map((fam) => (
                  <button key={fam} type="button" onClick={() => pick(googleKey(fam))}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--panel)", color: "var(--ink)", cursor: "pointer", fontWeight: 600 }}>
                    {t("th.fuse")} {fam}{byName.get(fam)?.t === 0 ? " · " + t("th.fnothaishort") : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {showBuiltIn && (
              <>
                <div className="muted" style={{ fontSize: 11.5, padding: "4px 6px", textTransform: "uppercase", letterSpacing: ".06em" }}>{t("th.fbundled")}</div>
                {FONT_OPTIONS.map((f) => (
                  <Row key={f.key} selected={f.key === value} onPick={() => pick(f.key)} name={f.label} meta={t("th.fbuiltin")} thai />
                ))}
                <div className="muted" style={{ fontSize: 11.5, padding: "8px 6px 4px", textTransform: "uppercase", letterSpacing: ".06em" }}>Google Fonts</div>
              </>
            )}
            {catalog === null && !catalogError && <div className="muted" style={{ padding: 8 }}>{t("th.floading")}</div>}
            {catalogError && <div style={{ padding: 8, color: "var(--bad)", fontSize: 13 }}>{t("th.fcaterr")}</div>}
            {matches.slice(0, SHOWN).map((f) => (
              <Row key={f.f} selected={googleKey(f.f) === value} onPick={() => pick(googleKey(f.f))} name={f.f} meta={f.c} thai={f.t === 1} />
            ))}
            {catalog && matches.length > SHOWN && <div className="muted" style={{ padding: 8, fontSize: 12.5 }}>{t("th.fmore").replace("{n}", String(matches.length - SHOWN))}</div>}
            {catalog && matches.length === 0 && !suggestion && <div className="muted" style={{ padding: 8 }}>{t("th.fnone")}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ name, meta, thai, selected, onPick }: { name: string; meta: string; thai: boolean; selected: boolean; onPick: () => void }) {
  const { t } = useLang();
  return (
    <button type="button" role="option" aria-selected={selected} onClick={onPick}
      style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 8px", border: 0, borderRadius: 7, background: selected ? "var(--sunk)" : "transparent", color: "var(--ink)", cursor: "pointer", textAlign: "left" }}>
      <span style={{ fontWeight: selected ? 700 : 500 }}>{name}</span>
      <span className="muted" style={{ fontSize: 12, display: "flex", gap: 8, whiteSpace: "nowrap" }}>
        {meta}
        <span style={{ color: thai ? "var(--ok)" : "var(--muted)" }}>{thai ? "ไทย ✓" : t("th.fnothaishort")}</span>
      </span>
    </button>
  );
}
