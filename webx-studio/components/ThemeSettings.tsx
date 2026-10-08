"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms } from "@/lib/cms";
import {
  AA, COLOR_KEYS, FONT_OPTIONS, RADIUS_LIMITS, THEME_DEFAULTS, compactTheme, contrastRatio, themeSupported,
  type ColorKey, type Theme,
} from "@/lib/theme";

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
const fontStack = (key?: string) => FONT_OPTIONS.find((f) => f.key === key)?.stack;

export default function ThemeSettings({ tenantKey }: { tenantKey: string }) {
  const { t, lang } = useLang();
  const supported = themeSupported(tenantKey);
  const d = THEME_DEFAULTS[tenantKey];

  const [docId, setDocId] = useState("");
  const [brand, setBrand] = useState<Record<string, any>>({});
  const [colors, setColors] = useState<Record<ColorKey, string>>(() => ({ ...(d?.colors ?? { primary: "", accent: "", ground: "", ink: "" }) }));
  const [fonts, setFonts] = useState({ display: d?.fonts.display ?? "", body: d?.fonts.body ?? "" });
  const [radius, setRadius] = useState(d?.radius ?? 0);
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
    const now = compactTheme(tenantKey, { colors, fonts, radius });
    const saved = compactTheme(tenantKey, brand.theme || {});
    return JSON.stringify(now) !== JSON.stringify(saved);
  }, [tenantKey, colors, fonts, radius, brand]);

  // Contrast of the two pairs that carry the whole page: body text on the
  // page background, and white button/heading text on the primary colour.
  const checks = [
    { label: t("th.c.text"), r: contrastRatio(colors.ink, colors.ground) },
    { label: t("th.c.primary"), r: contrastRatio("#ffffff", colors.primary) },
  ];

  async function save() {
    if (!docId) return;
    setSaving(true); setMsg(null);
    const theme = compactTheme(tenantKey, { colors, fonts, radius });
    // Replace `theme` inside the existing brand blob — the update overwrites
    // the whole `brand` field, so everything else in it must be sent back.
    const next = { ...brand };
    if (Object.keys(theme).length) next.theme = theme; else delete next.theme;
    try {
      await cms.entries.update(TENANT_UID, docId, { brand: next });
      setBrand(next);
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
    setColors({ ...d.colors }); setFonts({ ...d.fonts }); setRadius(d.radius); setMsg(null);
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
            {(["display", "body"] as const).map((k) => (
              <label key={k} style={{ display: "block", marginTop: 10 }}>
                <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{k === "display" ? t("th.fdisplay") : t("th.fbody")}</span>
                <select value={fonts[k]} onChange={(e) => setFonts((f) => ({ ...f, [k]: e.target.value }))} style={{ width: "100%" }}>
                  {FONT_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </label>
            ))}
            <div className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>{t("th.fnote")}</div>
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
            <div style={{ fontFamily: fontStack(fonts.display), fontSize: 26, fontWeight: 700, color: colors.primary, lineHeight: 1.3 }}>
              {lang === "th" ? "ราชบัณฑิตยสภา" : "Royal Society"}
            </div>
            <p style={{ margin: "10px 0 16px", lineHeight: 1.7 }}>
              {lang === "th" ? "แหล่งรวมองค์ความรู้ มาตรฐานภาษาไทย และข้อมูลวิชาการ" : "A single place for knowledge, Thai language standards and academic data."}
            </p>
            <span style={{ display: "inline-block", background: colors.primary, color: "#fff", padding: "9px 18px", borderRadius: Math.min(999, radius * 2), fontWeight: 600, fontSize: 14 }}>
              {t("br.getstarted")}
            </span>
            <span style={{ display: "inline-block", marginLeft: 10, color: colors.accent, fontWeight: 700, fontSize: 14 }}>{lang === "th" ? "ดูทั้งหมด ›" : "See all ›"}</span>
            <div style={{ marginTop: 18, background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: radius, padding: 14, fontSize: 14 }}>
              <b style={{ color: colors.primary, fontFamily: fontStack(fonts.display) }}>{lang === "th" ? "ข่าวและประกาศ" : "News & notices"}</b>
              <div style={{ color: colors.ink, opacity: 0.78, marginTop: 4 }}>{lang === "th" ? "ประกาศล่าสุดจากสำนักงาน" : "Latest announcements from the office"}</div>
            </div>
          </div>
          <div className="notice"><Icon name="spark" /> {t("th.note")}</div>
        </div>
      </div>
    </>
  );
}
