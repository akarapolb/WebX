"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import FontPicker from "./FontPicker";
import { googleFamilyOf, type CatalogFont } from "@/lib/googleFonts";
import { useLang } from "./LangProvider";
import { cms } from "@/lib/cms";
import {
  AA, BODY_WEIGHTS, COLOR_KEYS, FONT_OPTIONS, HEADING_WEIGHTS, RADIUS_LIMITS, THEME_DEFAULTS, TYPE_DEFAULTS, TYPE_LIMITS,
  PALETTE_MAX, compactTheme, contrastRatio, nextPaletteId, themeSupported, typeSupported,
  type ColorKey, type PaletteEntry, type Theme, type ThemeType,
} from "@/lib/theme";
import { invalidateThemeTokens } from "@/lib/useThemeTokens";

// Site-wide theme — the Customizer-style controls (colours, fonts, corner
// radius) for the WordPress-engine tenants. Saved as `brand.theme` on the
// tenant record; public-site/lib/theme.ts turns it into CSS and is the
// authority on what is allowed.
//
// Goes through the governed cms layer (api::tenant.tenant) rather than
// Strapi's /console/branding like the Appearance tab does: that endpoint
// 403s for a WordPress session, and these are exactly the tenants this
// applies to.

const TENANT_UID = "api::tenant.tenant";
// A Google font keeps the bundled Thai-capable family as its fallback — the same
// stack the public site builds (public-site/lib/theme.ts), so the preview and the
// page agree on what Thai text in a font with no Thai glyphs looks like.
const fontStack = (key?: string, role: "display" | "body" = "body") => {
  const g = googleFamilyOf(key);
  if (g) return `"${g}", ${FONT_OPTIONS.find((f) => f.key === (role === "display" ? "noto-serif" : "plex-sans"))?.stack}`;
  return FONT_OPTIONS.find((f) => f.key === key)?.stack;
};

export default function ThemeSettings({ tenantKey }: { tenantKey: string }) {
  const { t, lang } = useLang();
  const supported = themeSupported(tenantKey);
  const d = THEME_DEFAULTS[tenantKey];

  const [docId, setDocId] = useState("");
  const [brand, setBrand] = useState<Record<string, any>>({});
  const [colors, setColors] = useState<Record<ColorKey, string>>(() => ({ ...(d?.colors ?? { primary: "", accent: "", ground: "", ink: "" }) }));
  const [fonts, setFonts] = useState({ display: d?.fonts.display ?? "", body: d?.fonts.body ?? "" });
  const [radius, setRadius] = useState(d?.radius ?? 0);
  const hasType = typeSupported(tenantKey);
  const [typo, setTypo] = useState<Required<ThemeType>>({ ...TYPE_DEFAULTS });
  const setT = (patch: Partial<ThemeType>) => setTypo((v) => ({ ...v, ...patch }));
  const [palette, setPalette] = useState<PaletteEntry[]>([]);
  const setEntry = (id: string, patch: Partial<PaletteEntry>) => setPalette((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  function addColor() {
    const id = nextPaletteId(palette);
    if (!id) return;
    setPalette((p) => [...p, { id, name: t("th.palname") + " " + id.slice(1), value: colors.accent || "#3388cc" }]);
  }

  // Google Fonts: the catalogue for the picker, and — for the live preview on THIS
  // admin screen only — the picked families loaded from Google. The public site
  // never does this: its fonts are downloaded at build time and self-hosted.
  const [catalog, setCatalog] = useState<CatalogFont[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  useEffect(() => {
    if (!hasType) return;
    let live = true;
    fetch("/api/fonts")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) setCatalog(j.fonts as CatalogFont[]); })
      .catch(() => { if (live) setCatalogError(true); });
    return () => { live = false; };
  }, [hasType]);
  useEffect(() => {
    const links = [fonts.display, fonts.body]
      .map(googleFamilyOf)
      .filter((x, i, a): x is string => !!x && a.indexOf(x) === i)
      .map((fam) => {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(fam).replace(/%20/g, "+") + "&display=swap";
        document.head.appendChild(l);
        return l;
      });
    return () => links.forEach((l) => l.remove());
  }, [fonts.display, fonts.body]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  // Load the tenant's saved theme over the defaults.
  useEffect(() => {
    if (!supported) return;
    let live = true;
    (async () => {
      try {
        const { data } = await cms.entries.list<any>(TENANT_UID, { pageSize: 50 });
        const row = data.find((x: any) => x.key === tenantKey);
        if (!live || !row) return;
        setDocId(String(row.documentId ?? row.id));
        const b = row.brand && typeof row.brand === "object" ? row.brand : {};
        setBrand(b);
        const th: Theme = b.theme && typeof b.theme === "object" ? b.theme : {};
        setColors({ ...d.colors, ...Object.fromEntries(COLOR_KEYS.filter((k) => th.colors?.[k]).map((k) => [k, th.colors![k]])) } as Record<ColorKey, string>);
        setFonts({ display: th.fonts?.display || d.fonts.display, body: th.fonts?.body || d.fonts.body });
        setRadius(typeof th.radius === "number" ? th.radius : d.radius);
        setTypo({ ...TYPE_DEFAULTS, ...Object.fromEntries(Object.entries(th.type ?? {}).filter(([, v]) => typeof v === "number")) });
        setPalette(Array.isArray(th.palette) ? th.palette.map((e) => ({ ...e })) : []);
      } catch {
        if (live) setMsg({ t: t("th.loaderr"), ok: false });
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey]);

  const dirty = useMemo(() => {
    const now = compactTheme(tenantKey, { colors, fonts, radius, type: typo, palette });
    const saved = compactTheme(tenantKey, brand.theme || {});
    return JSON.stringify(now) !== JSON.stringify(saved);
  }, [tenantKey, colors, fonts, radius, typo, palette, brand]);

  // Contrast of the two pairs that carry the whole page: body text on the
  // page background, and white button/heading text on the primary colour.
  const checks = [
    { label: t("th.c.text"), r: contrastRatio(colors.ink, colors.ground) },
    { label: t("th.c.primary"), r: contrastRatio("#ffffff", colors.primary) },
  ];

  async function save() {
    if (!docId) return;
    setSaving(true); setMsg(null);
    const theme = compactTheme(tenantKey, { colors, fonts, radius, type: typo, palette });
    // Replace `theme` inside the existing brand blob — the update overwrites
    // the whole `brand` field, so everything else in it must be sent back.
    try {
      // Merge into the brand as it is NOW, not as it was when this page opened: something else (the Visual
      // Builder's saved style presets) may have written to it since, and the update replaces the whole field.
      const { data } = await cms.entries.list<any>(TENANT_UID, { pageSize: 50 });
      const fresh = data.find((x: any) => x.key === tenantKey);
      const base = fresh?.brand && typeof fresh.brand === "object" ? fresh.brand : brand;
      const next = { ...base };
      if (Object.keys(theme).length) next.theme = theme; else delete next.theme;
      await cms.entries.update(TENANT_UID, docId, { brand: next });
      setBrand(next);
      invalidateThemeTokens(tenantKey);   // the Visual Builder's colour chips read this
      setMsg({ t: t("th.saved"), ok: true });
      // Fire-and-forget, same as the Appearance tab: a static public site
      // only picks the change up on its next build.
      fetch("/api/cms/public-site/rebuild", { method: "POST" }).catch(() => {});
    } catch {
      setMsg({ t: t("th.saveerr"), ok: false });
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (!d) return;
    setColors({ ...d.colors }); setFonts({ ...d.fonts }); setRadius(d.radius); setTypo({ ...TYPE_DEFAULTS }); setPalette([]); setMsg(null);
  }

  if (!supported) {
    return <div className="notice"><Icon name="spark" /> {t("th.unsupported")}</div>;
  }

  const colorLabel: Record<ColorKey, string> = {
    primary: t("th.primary"), accent: t("th.accent"), ground: t("th.ground"), ink: t("th.ink"),
  };

  return (
    <>
      <div className="vh-act" style={{ marginBottom: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="btn" onClick={reset} disabled={saving || !loaded}>{t("th.reset")}</button>
        <button className="btn btn--p" onClick={save} disabled={saving || !loaded || !dirty || !docId}>
          <Icon name="palette" />{saving ? t("br.saving") : t("th.save")}
        </button>
      </div>

      {msg && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <span className={"badge " + (msg.ok ? "b-ok" : "b-warn")}><span className="dot" />{msg.ok ? "OK" : "!"}</span>
          <span style={{ marginLeft: 10, color: msg.ok ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{msg.t}</span>
        </div>
      )}

      <div className="brand-grid">
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>{t("th.colors")}</h3></div>
            {COLOR_KEYS.map((k) => (
              <div key={k} className="color-in" style={{ marginTop: 10 }}>
                <input type="color" aria-label={colorLabel[k]} value={colors[k]} onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))} />
                <input type="text" aria-label={colorLabel[k] + " hex"} value={colors[k]} maxLength={7}
                  onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))} />
                <span style={{ fontSize: 13.5 }}>{colorLabel[k]}</span>
              </div>
            ))}
            <div style={{ display: "grid", gap: 6, marginTop: 14 }}>
              {checks.map((c) => (
                <span key={c.label} className={"badge " + (c.r == null ? "b-warn" : c.r >= AA ? "b-ok" : "b-warn")} style={{ justifySelf: "start" }}>
                  <span className="dot" />
                  {c.label}: {c.r == null ? t("th.badcolor") : c.r.toFixed(1) + ":1 " + (c.r >= AA ? t("th.aaok") : t("th.aalow"))}
                </span>
              ))}
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>{t("th.typography")}</h3></div>
            {(["display", "body"] as const).map((k) => hasType ? (
              <div key={k} style={{ marginTop: 10 }}>
                <FontPicker value={fonts[k]} label={k === "display" ? t("th.fdisplay") : t("th.fbody")} catalog={catalog} catalogError={catalogError}
                  onChange={(key) => setFonts((f) => ({ ...f, [k]: key }))} />
              </div>
            ) : (
              <label key={k} style={{ display: "block", marginTop: 10 }}>
                <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{k === "display" ? t("th.fdisplay") : t("th.fbody")}</span>
                <select value={fonts[k]} onChange={(e) => setFonts((f) => ({ ...f, [k]: e.target.value }))} style={{ width: "100%" }}>
                  {FONT_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </label>
            ))}
            <div className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>{t("th.fnote")}</div>

            {hasType && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line2)", display: "grid", gap: 12 }}>
                {([
                  { k: "size", label: t("th.tsize"), lim: TYPE_LIMITS.size, fmt: (v: number) => v + "%" },
                  { k: "headingScale", label: t("th.thscale"), lim: TYPE_LIMITS.headingScale, fmt: (v: number) => Math.round(v * 100) + "%" },
                  { k: "leading", label: t("th.tleading"), lim: TYPE_LIMITS.leading, fmt: (v: number) => v.toFixed(2) },
                ] as const).map((c) => (
                  <label key={c.k} style={{ display: "block" }}>
                    <span style={{ display: "block", fontSize: 13, marginBottom: 2 }}>{c.label}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <input type="range" min={c.lim.min} max={c.lim.max} step={c.lim.step} value={typo[c.k]}
                        onChange={(e) => setT({ [c.k]: Number(e.target.value) })} style={{ flex: 1 }} aria-label={c.label} />
                      <b style={{ minWidth: 52, textAlign: "right" }}>{c.fmt(typo[c.k])}</b>
                    </span>
                  </label>
                ))}
                <div style={{ display: "flex", gap: 12 }}>
                  <label style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{t("th.tbweight")}</span>
                    <select value={typo.weight} onChange={(e) => setT({ weight: Number(e.target.value) })} style={{ width: "100%" }}>
                      {BODY_WEIGHTS.map((w) => <option key={w} value={w}>{t("th.w" + w)}</option>)}
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{t("th.thweight")}</span>
                    <select value={typo.headingWeight} onChange={(e) => setT({ headingWeight: Number(e.target.value) })} style={{ width: "100%" }}>
                      {HEADING_WEIGHTS.map((w) => <option key={w} value={w}>{t("th.w" + w)}</option>)}
                    </select>
                  </label>
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>{t("th.tnote")}</div>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>{t("th.palette")}</h3></div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{t("th.palettenote")}</div>
            <div className="pal-core">
              {COLOR_KEYS.map((k) => (
                <span key={k} className="pal-chip" title={"@" + k}><i style={{ background: colors[k] }} />{colorLabel[k]}</span>
              ))}
            </div>
            {palette.map((e) => (
              <div key={e.id} className="pal-row">
                <input type="color" aria-label={e.name} value={/^#[0-9a-f]{6}$/i.test(e.value) ? e.value : "#000000"}
                  onChange={(ev) => setEntry(e.id, { value: ev.target.value })} />
                <input className="pal-hex" value={e.value} maxLength={7} aria-label={e.name + " hex"}
                  onChange={(ev) => setEntry(e.id, { value: ev.target.value })} />
                <input className="pal-name" value={e.name} maxLength={24} aria-label={t("th.palname")}
                  onChange={(ev) => setEntry(e.id, { name: ev.target.value })} />
                <button type="button" className="ic-btn" style={{ color: "var(--bad)" }} title={t("th.paldel")} onClick={() => setPalette((p) => p.filter((x) => x.id !== e.id))}>
                  <Icon name="trash" />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <button type="button" className="btn" onClick={addColor} disabled={!nextPaletteId(palette)}><Icon name="plus" />{t("th.paladd")}</button>
              <span className="muted" style={{ fontSize: 12.5 }}>{palette.length} / {PALETTE_MAX}</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>{t("th.shape")}</h3></div>
            <label style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <input type="range" min={RADIUS_LIMITS.min} max={RADIUS_LIMITS.max} value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ flex: 1 }} aria-label={t("th.radius")} />
              <b style={{ minWidth: 48, textAlign: "right" }}>{radius}px</b>
            </label>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t("th.radius")}</div>
          </div>
        </div>

        <div>
          <div className="muted" style={{ marginBottom: 9 }}>{t("br.preview")}</div>
          <div style={{ background: colors.ground, color: colors.ink, border: "1px solid var(--line2)", borderRadius: radius, padding: 22, fontFamily: fontStack(fonts.body) }}>
            <div style={{ fontFamily: fontStack(fonts.display, "display"), fontSize: 26 * typo.headingScale * (typo.size / 100), fontWeight: hasType ? typo.headingWeight : 700, color: colors.primary, lineHeight: 1.3 }}>
              {lang === "th" ? "ราชบัณฑิตยสภา" : "Royal Society"}
            </div>
            <p style={{ margin: "10px 0 16px", lineHeight: hasType ? typo.leading : 1.7, fontWeight: hasType ? typo.weight : undefined, fontSize: 15 * (typo.size / 100) }}>
              {lang === "th" ? "แหล่งรวมองค์ความรู้ มาตรฐานภาษาไทย และข้อมูลวิชาการ" : "A single place for knowledge, Thai language standards and academic data."}
            </p>
            <span style={{ display: "inline-block", background: colors.primary, color: "#fff", padding: "9px 18px", borderRadius: Math.min(999, radius * 2), fontWeight: 600, fontSize: 14 }}>
              {t("br.getstarted")}
            </span>
            <span style={{ display: "inline-block", marginLeft: 10, color: colors.accent, fontWeight: 700, fontSize: 14 }}>{lang === "th" ? "ดูทั้งหมด ›" : "See all ›"}</span>
            <div style={{ marginTop: 18, background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: radius, padding: 14, fontSize: 14 }}>
              <b style={{ color: colors.primary, fontFamily: fontStack(fonts.display, "display") }}>{lang === "th" ? "ข่าวและประกาศ" : "News & notices"}</b>
              <div style={{ color: colors.ink, opacity: 0.78, marginTop: 4 }}>{lang === "th" ? "ประกาศล่าสุดจากสำนักงาน" : "Latest announcements from the office"}</div>
            </div>
          </div>
          <div className="notice"><Icon name="spark" /> {t("th.note")}</div>
        </div>
      </div>
    </>
  );
}
