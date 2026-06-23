"use client";
import { useEffect, useState, useRef } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";

const SWATCHES = ["#6366F1", "#8B5CF6", "#14B8A6", "#EE5020", "#F59E0B", "#10B981", "#3B82F6", "#EC4899"];
const PRESETS = [
  { key: "dga", th: "สพร. (DGA)", en: "DGA", color: "#EE5020", tmpl: "classic" },
  { key: "pea", th: "กฟภ. (PEA)", en: "PEA", color: "#8B5CF6", tmpl: "split" },
  { key: "ocean", th: "โอเชียน", en: "Ocean", color: "#0EA5E9", tmpl: "editorial" },
  { key: "forest", th: "ฟอเรสต์", en: "Forest", color: "#10B981", tmpl: "classic" },
  { key: "indigo", th: "อินดิโก", en: "Indigo", color: "#6366F1", tmpl: "split" },
  { key: "sunset", th: "ซันเซ็ต", en: "Sunset", color: "#F59E0B", tmpl: "editorial" },
];
const TMPLS = [{ key: "classic", en: "Classic", th: "คลาสสิก" }, { key: "split", en: "Split", th: "สปลิต" }, { key: "editorial", en: "Editorial", th: "เอดิทอเรียล" }];

// ---- color math ----
function hexToRgb(h: string): [number, number, number] {
  let s = h.replace("#", ""); if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
const rgbToHex = (a: number[]) => "#" + a.map((x) => clamp(x).toString(16).padStart(2, "0")).join("");
const mix = (hex: string, target: string, amt: number) => { const a = hexToRgb(hex), b = hexToRgb(target); return rgbToHex(a.map((c, i) => c + (b[i] - c) * amt)); };
const tint = (h: string, a: number) => mix(h, "#ffffff", a);
const shade = (h: string, a: number) => mix(h, "#000000", a);
function luminance(hex: string) { const a = hexToRgb(hex).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
function contrast(h1: string, h2: string) { const l1 = luminance(h1), l2 = luminance(h2); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }
const valid = (h: string) => /^#[0-9a-fA-F]{6}$/.test(h);
const mediaSrc = (u: string) => (u.startsWith("http") ? u : "/api/strapi" + u);

function applyAccent(hex: string) {
  if (!valid(hex)) return;
  const r = document.documentElement;
  r.style.setProperty("--accent", hex);
  r.style.setProperty("--accent2", shade(hex, 0.12));
  r.style.setProperty("--accent-soft", hex + "29");
  r.style.setProperty("--grad", `linear-gradient(135deg,${hex},${shade(hex, 0.18)})`);
}

export default function Branding() {
  const { t, lang } = useLang();
  const th = lang === "th";
  const { currentKey, current } = useTenant();
  const [color, setColor] = useState("#6366F1");
  const [logo, setLogo] = useState<{ url: string; id?: number } | null>(null);
  const [tmpl, setTmpl] = useState("classic");
  const [wm, setWm] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "";

  useEffect(() => {
    (async () => {
      try {
        const j = await fetch("/api/strapi/api/console/context").then((r) => (r.ok ? r.json() : null));
        const list = j?.tenants ?? j?.data?.tenants ?? [];
        const tn = list.find((x: any) => x.key === currentKey) ?? list[0];
        const c = tn?.brand?.primaryColor || tn?.brand?.color || "#6366F1";
        setColor(c); applyAccent(c);
        setTmpl(tn?.template?.key || "classic");
        setWm(Boolean(tn?.watermark?.enabled));
        const lg = tn?.brand?.logo?.url || tn?.logo?.url;
        setLogo(lg ? { url: lg } : null);
      } catch {}
    })();
  }, [currentKey]);

  function pick(c: string) { setColor(c); applyAccent(c); }
  function applyPreset(p: typeof PRESETS[number]) { pick(p.color); setTmpl(p.tmpl); }

  async function uploadLogo(file: File) {
    setUploading(true); setMsg(null);
    const fd = new FormData(); fd.append("files", file);
    try {
      const r = await fetch("/api/strapi/upload", { method: "POST", body: fd });
      if (r.ok) { const j = await r.json(); const f = Array.isArray(j) ? j[0] : j; if (f?.url) setLogo({ url: f.url, id: f.id }); }
      else setMsg({ t: "Upload failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Upload failed", ok: false }); }
    finally { setUploading(false); }
  }

  async function save() {
    setSaving(true); setMsg(null);
    const body: any = { brand: { primaryColor: color }, template: { key: tmpl }, watermark: { enabled: wm } };
    if (logo?.id) body.brand.logo = logo.id;
    try {
      const r = await fetch("/api/strapi/api/console/branding" + (tenant ? "?tenant=" + encodeURIComponent(tenant) : ""), {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setMsg(r.ok ? { t: t("br.saved"), ok: true } : { t: "Save failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  const brandName = current?.name || "WebX";
  const safe = valid(color) ? color : "#6366F1";
  const palette = [tint(safe, 0.82), tint(safe, 0.58), tint(safe, 0.3), safe, shade(safe, 0.22), shade(safe, 0.42)];
  const cWhite = contrast(safe, "#ffffff");
  const aa = cWhite >= 4.5, aaLarge = cWhite >= 3;

  const pv: any = mode === "dark"
    ? { "--pv-bg": "#0e0f17", "--pv-panel": "#171a24", "--pv-text": "#eceef6", "--pv-mut": "#9298ad", "--pv-line": "#272b3b", "--pv-nav": "#12141f" }
    : { "--pv-bg": "#ffffff", "--pv-panel": "#f4f6fb", "--pv-text": "#11131f", "--pv-mut": "#6b7186", "--pv-line": "#e7e9f4", "--pv-nav": "#ffffff" };
  pv["--pv-acc"] = safe; pv["--pv-acc2"] = shade(safe, 0.16); pv["--pv-soft"] = safe + "1f"; pv["--pv-on"] = aaLarge ? "#ffffff" : "#11131f";

  const SERVICES = th
    ? [["บริการ e-Service", "ยื่นคำขอออนไลน์"], ["ข้อมูลเปิดภาครัฐ", "ชุดข้อมูลสาธารณะ"], ["ติดตามสถานะ", "ตรวจสอบคำร้อง"], ["ข่าว & ประกาศ", "อัปเดตล่าสุด"]]
    : [["e-Services", "Apply online"], ["Open Data", "Public datasets"], ["Track status", "Check requests"], ["News", "Latest updates"]];

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.branding")}</h1><p>{th ? "ปรับแบรนด์ของหน่วยงานนี้ — เห็นผลสดทันที (แยกต่อ tenant)" : "Brand this tenant — live, isolated per workspace"}</p></div>
        <div className="vh-act">
          <button className="btn btn--p" onClick={save} disabled={saving}><Icon name="palette" />{saving ? t("br.saving") : t("br.save")}</button>
        </div>
      </div>

      {msg && <div className="panel" style={{ marginBottom: 14 }}><span className={"badge " + (msg.ok ? "b-ok" : "b-warn")}><span className="dot" />{msg.ok ? "OK" : "!"}</span><span style={{ marginLeft: 10, color: msg.ok ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{msg.t}</span></div>}

      <div className="brand-grid">
        <div>
          {/* presets */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>{th ? "ธีมสำเร็จรูป" : "Brand presets"}</h3></div>
            <div className="bs-presets">
              {PRESETS.map((p) => (
                <button key={p.key} className={"bs-preset" + (color.toLowerCase() === p.color.toLowerCase() ? " on" : "")} onClick={() => applyPreset(p)}>
                  <span className="bs-pre-sw" style={{ background: `linear-gradient(135deg,${p.color},${shade(p.color, 0.18)})` }} />
                  <b>{th ? p.th : p.en}</b>
                </button>
              ))}
            </div>
          </div>

          {/* primary color + palette */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>{t("br.accent")}</h3>
              <span className={"bs-aa " + (aa ? "ok" : aaLarge ? "warn" : "bad")}>
                <Icon name="eye" />{aa ? (th ? "ผ่าน AA" : "AA pass") : aaLarge ? (th ? "AA (ตัวใหญ่)" : "AA large") : (th ? "คอนทราสต์ต่ำ" : "Low contrast")} · {cWhite.toFixed(1)}:1
              </span>
            </div>
            <div className="swatches">
              {SWATCHES.map((s) => <div key={s} className={"sw" + (color.toLowerCase() === s.toLowerCase() ? " on" : "")} style={{ background: s }} onClick={() => pick(s)} />)}
            </div>
            <div className="color-in">
              <input type="color" value={safe} onChange={(e) => pick(e.target.value)} />
              <input type="text" value={color} onChange={(e) => pick(e.target.value)} />
            </div>
            <div className="bs-pal-h">{th ? "พาเลตอัตโนมัติ" : "Auto palette"}</div>
            <div className="bs-pal">
              {palette.map((c, i) => <span key={i} className="bs-pal-c" style={{ background: c }} title={c} />)}
            </div>
          </div>

          {/* logo */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>{th ? "โลโก้" : "Logo"}</h3></div>
            <div className="bs-logo">
              <div className="bs-logo-pv">{logo ? <img src={mediaSrc(logo.url)} alt="logo" /> : <span>{brandName[0]?.toUpperCase()}</span>}</div>
              <div style={{ flex: 1 }}>
                <button className="btn btn--g" onClick={() => fileRef.current?.click()} disabled={uploading}><Icon name="img" />{uploading ? (th ? "กำลังอัปโหลด…" : "Uploading…") : logo ? (th ? "เปลี่ยนโลโก้" : "Replace") : (th ? "อัปโหลดโลโก้" : "Upload logo")}</button>
                {logo && <button className="btn btn--g" style={{ marginLeft: 8 }} onClick={() => setLogo(null)}>{th ? "ลบ" : "Remove"}</button>}
                <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>{th ? "PNG โปร่งใส แนะนำสูง 64px" : "Transparent PNG, ~64px tall"}</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            </div>
          </div>

          {/* template */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>{t("br.template")}</h3></div>
            <div className="tmpls">
              {TMPLS.map((tm) => (
                <div key={tm.key} className={"tmpl" + (tmpl === tm.key ? " on" : "")} onClick={() => setTmpl(tm.key)}>
                  <div className="tmpl-pv"><i style={{ height: 10, width: "50%" }} /><i style={{ height: 6, width: "80%" }} /><i style={{ height: 6, width: "65%" }} /><i style={{ height: 14, width: "40%", marginTop: "auto", background: "var(--accent)" }} /></div>
                  <b>{th ? tm.th : tm.en}</b>
                </div>
              ))}
            </div>
          </div>

          {/* watermark */}
          <div className="panel">
            <div className="panel-h"><h3>{t("br.watermark")}</h3></div>
            <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 13.5, color: "var(--ink2)" }}>
              <input type="checkbox" checked={wm} onChange={(e) => setWm(e.target.checked)} /> {t("br.wmon")}
            </label>
          </div>
        </div>

        {/* live preview */}
        <div>
          <div className="bs-pv-bar">
            <span className="muted">{t("br.preview")}</span>
            <div className="bs-toggles">
              <div className="view-tg">
                <button className={device === "desktop" ? "on" : ""} onClick={() => setDevice("desktop")} title="Desktop"><Icon name="desktop" /></button>
                <button className={device === "mobile" ? "on" : ""} onClick={() => setDevice("mobile")} title="Mobile"><Icon name="mobile" /></button>
              </div>
              <div className="view-tg">
                <button className={mode === "light" ? "on" : ""} onClick={() => setMode("light")} title="Light">☀</button>
                <button className={mode === "dark" ? "on" : ""} onClick={() => setMode("dark")} title="Dark">☾</button>
              </div>
            </div>
          </div>

          <div className="bs-stage">
            <div className={"pv-frame d-" + device + (wm ? " wm" : "")} style={pv}>
              <div className="pv-chrome"><i /><i /><i /><span className="pv-url"><Icon name="lock" />{(tenant || "agency") + ".go.th"}</span></div>
              <header className="pv-head">
                <div className="pv-logo">{logo ? <img src={mediaSrc(logo.url)} alt="" /> : <><span className="pv-mark" />{brandName}</>}</div>
                <nav>{(th ? ["หน้าแรก", "บริการ", "ข่าว", "ติดต่อ"] : ["Home", "Services", "News", "Contact"]).map((n) => <span key={n}>{n}</span>)}</nav>
                <span className="pv-cta">{th ? "เข้าสู่ระบบ" : "Sign in"}</span>
              </header>
              <section className="pv-hero" data-wm={brandName.toUpperCase()}>
                <span className="pv-tag">{th ? "รัฐบาลดิจิทัล" : "Digital Government"}</span>
                <h3>{th ? "บริการดิจิทัลภาครัฐ เพื่อประชาชนทุกคน" : "Digital public services for everyone"}</h3>
                <p>{th ? "ค้นหาบริการ เอกสาร และข้อมูลภาครัฐ ได้ในที่เดียว" : "Find services, documents and open data in one place."}</p>
                <div className="pv-search"><Icon name="search" /><span>{th ? "ค้นหาบริการ เช่น ขอหนังสือรับรอง…" : "Search services…"}</span><span className="pv-sbtn">{th ? "ค้นหา" : "Search"}</span></div>
              </section>
              <div className="pv-cards">
                {SERVICES.map(([h, s], i) => (
                  <div className="pv-card" key={i}><span className="pv-ic"><Icon name={["package", "layout", "check", "bell"][i]} /></span><b>{h}</b><span>{s}</span></div>
                ))}
              </div>
            </div>
          </div>
          <div className="notice"><Icon name="spark" /> {th ? "นี่คือภาพจำลองหน้าเว็บจริงของหน่วยงานนี้ — สี โลโก้ ปรับสดตามที่เลือก" : t("br.note")}</div>
        </div>
      </div>
    </>
  );
}
