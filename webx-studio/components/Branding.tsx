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
// เทมเพลต: studio ใช้ key (classic/split/editorial) แต่หน้าบ้าน (tenant.js → templates.css) อ่าน preset (a/b/c) — ต้อง map ให้ตรง
const TMPL_PRESET: Record<string, string> = { classic: "a", split: "b", editorial: "c" };
const PRESET_TMPL: Record<string, string> = { a: "classic", b: "split", c: "editorial" };

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

// ดึงสีเด่นจากรูปโลโก้ผ่าน canvas → คืน hex ไม่ซ้ำ เรียงตามความถี่ (ข้ามโปร่งใส/ดำ-ขาวจัด/เทากลาง)
async function extractColors(src: string, max = 5): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const S = 48, cv = document.createElement("canvas"); cv.width = S; cv.height = S;
        const cx = cv.getContext("2d"); if (!cx) return resolve([]);
        cx.drawImage(img, 0, 0, S, S);
        const d = cx.getImageData(0, 0, S, S).data;
        const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;                                  // โปร่งใส
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
          if (hi < 24 || lo > 232) continue;                             // ดำ/ขาวจัด
          if (hi - lo < 18 && hi > 60 && hi < 200) continue;             // เทากลาง
          const key = `${r >> 5}-${g >> 5}-${b >> 5}`;                   // quantize
          const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
          e.n++; e.r += r; e.g += g; e.b += b; buckets.set(key, e);
        }
        const sorted = [...buckets.values()].sort((a, b) => b.n - a.n)
          .map((e) => rgbToHex([e.r / e.n, e.g / e.n, e.b / e.n]));
        const out: string[] = [];
        for (const c of sorted) {
          if (!out.some((o) => Math.abs(parseInt(o.slice(1), 16) - parseInt(c.slice(1), 16)) < 0x101010)) out.push(c);
          if (out.length >= max) break;
        }
        resolve(out);
      } catch { resolve([]); }
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
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
  const [logoColors, setLogoColors] = useState<string[]>([]);
  const [sweep, setSweep] = useState<{ x: number; y: number; c: string; id: number } | null>(null);
  const [toast, setToast] = useState<{ t: string; ok: boolean } | null>(null);
  const [pulse, setPulse] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "";

  useEffect(() => {
    (async () => {
      try {
        const j = await fetch("/api/strapi/api/console/context").then((r) => (r.ok ? r.json() : null));
        const list = j?.tenants ?? j?.data?.tenants ?? [];
        const tn = list.find((x: any) => x.key === currentKey) ?? list[0];
        const c = tn?.brand?.primaryColor || tn?.brand?.color || "#6366F1";
        setColor(c); applyAccent(c);
        setTmpl(tn?.template?.key || PRESET_TMPL[tn?.template?.preset] || "classic");
        setWm(Boolean(tn?.watermark?.enabled));
        const lg = tn?.brand?.logo?.url || tn?.logo?.url;
        setLogo(lg ? { url: lg } : null);
      } catch {}
    })();
  }, [currentKey]);

  // เลือกสี + ยิงเอฟเฟกต์ "ทาสีแผ่ออก" จากจุดที่คลิกบนพรีวิว
  function pick(c: string, ev?: { clientX: number; clientY: number }) {
    setColor(c); applyAccent(c);
    const box = stageRef.current?.getBoundingClientRect();
    if (box && valid(c)) {
      const x = ev ? ev.clientX - box.left : box.width * 0.82;
      const y = ev ? ev.clientY - box.top : box.height * 0.16;
      setSweep({ x, y, c, id: Date.now() });
    }
  }
  function applyPreset(p: typeof PRESETS[number], ev?: { clientX: number; clientY: number }) { pick(p.color, ev); setTmpl(p.tmpl); }

  async function uploadLogo(file: File) {
    setUploading(true); setMsg(null);
    const fd = new FormData(); fd.append("files", file);
    try {
      const r = await fetch("/api/strapi/upload", { method: "POST", body: fd });
      if (r.ok) {
        const j = await r.json(); const f = Array.isArray(j) ? j[0] : j;
        if (f?.url) { setLogo({ url: f.url, id: f.id }); extractColors(mediaSrc(f.url)).then(setLogoColors).catch(() => {}); }
      }
      else setMsg({ t: "Upload failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Upload failed", ok: false }); }
    finally { setUploading(false); }
  }

  async function save() {
    setSaving(true); setMsg(null);
    const body: any = { brand: { primaryColor: color }, template: { key: tmpl, preset: TMPL_PRESET[tmpl] || "a" }, watermark: { enabled: wm } };
    if (logo?.id) body.brand.logo = logo.id;
    try {
      const r = await fetch("/api/strapi/api/console/branding" + (tenant ? "?tenant=" + encodeURIComponent(tenant) : ""), {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (r.ok) {
        setMsg(null); setToast({ t: t("br.saved"), ok: true });
        setPulse(true); setTimeout(() => setPulse(false), 1100); setTimeout(() => setToast(null), 3200);
      } else { setToast({ t: "Save failed (HTTP " + r.status + ")", ok: false }); setTimeout(() => setToast(null), 4000); }
    } catch { setToast({ t: th ? "เชื่อมต่อหลังบ้านไม่ได้" : "Cannot reach the backend.", ok: false }); setTimeout(() => setToast(null), 4000); }
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
          <button className={"btn btn--p" + (pulse ? " bs-pulse" : "")} onClick={save} disabled={saving}><Icon name={pulse ? "check" : "palette"} />{saving ? t("br.saving") : pulse ? (th ? "บันทึกแล้ว" : "Saved") : t("br.save")}</button>
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
                <button key={p.key} className={"bs-preset" + (color.toLowerCase() === p.color.toLowerCase() ? " on" : "")} onClick={(e) => applyPreset(p, e)}>
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
              {SWATCHES.map((s) => <div key={s} className={"sw" + (color.toLowerCase() === s.toLowerCase() ? " on" : "")} style={{ background: s }} onClick={(e) => pick(s, e)} />)}
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
            {logoColors.length > 0 && (
              <div className="bs-logocolors">
                <span className="bs-lc-label">{th ? "🎯 ดึงสีจากโลโก้ — กดเพื่อใช้เป็นสีแบรนด์" : "🎯 Colors from your logo — tap to apply"}</span>
                <div className="bs-lc-row">
                  {logoColors.map((c) => (
                    <button key={c} type="button" title={c} className={"bs-lc" + (color.toLowerCase() === c.toLowerCase() ? " on" : "")} style={{ background: c }} onClick={(e) => pick(c, e)} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* template */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h3>{t("br.template")}</h3></div>
            <p className="muted" style={{ fontSize: 11.5, margin: "-4px 0 12px" }}>{th ? "สไตล์เลย์เอาต์ทั้งเว็บ (ความโค้ง/สเปซ/หัวข้อ) — ดูผลสดในพรีวิว แล้วกดบันทึก" : "Site-wide layout style (corners/spacing/headers) — preview live, then Save"}</p>
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

          <div className="bs-stage" ref={stageRef} style={{ position: "relative", overflow: "hidden" }}>
            {sweep && (
              <span key={sweep.id} className="bs-sweep" onAnimationEnd={() => setSweep(null)}
                style={{ left: sweep.x, top: sweep.y, background: sweep.c }} />
            )}
            <div className={"pv-frame d-" + device + (wm ? " wm" : "")} data-template={TMPL_PRESET[tmpl] || "a"} style={pv}>
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

      {toast && (
        <div className={"bs-toast " + (toast.ok ? "ok" : "bad")}>
          {toast.ok && <span className="bs-spark" aria-hidden>{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ ["--d" as any]: i }} />)}</span>}
          <Icon name={toast.ok ? "check" : "spark"} /><span>{toast.t}</span>
        </div>
      )}

      <style>{`
        .bs-sweep{position:absolute;width:44px;height:44px;border-radius:50%;transform:translate(-50%,-50%) scale(0);pointer-events:none;z-index:6;opacity:.85;animation:bsSweep .62s cubic-bezier(.4,0,.2,1) forwards}
        @keyframes bsSweep{0%{transform:translate(-50%,-50%) scale(0);opacity:.82}55%{opacity:.5}100%{transform:translate(-50%,-50%) scale(62);opacity:0}}
        .bs-pulse{animation:bsPulse .5s ease}
        @keyframes bsPulse{0%{transform:scale(1)}42%{transform:scale(1.07)}100%{transform:scale(1)}}
        .bs-logocolors{margin-top:14px;border-top:1px solid var(--line2);padding-top:13px}
        .bs-lc-label{font-size:12px;font-weight:600;color:var(--ink2);display:block;margin-bottom:9px}
        .bs-lc-row{display:flex;gap:8px;flex-wrap:wrap}
        .bs-lc{width:34px;height:34px;border-radius:9px;border:2px solid var(--line2);cursor:pointer;padding:0;transition:transform .14s,border-color .14s,box-shadow .14s;animation:bsPop .32s ease both}
        .bs-lc:hover{transform:translateY(-3px) scale(1.07)}
        .bs-lc.on{border-color:var(--ink);box-shadow:0 0 0 2px var(--accent)}
        @keyframes bsPop{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:none}}
        .bs-toast{position:fixed;right:22px;bottom:22px;z-index:200;display:flex;align-items:center;gap:9px;padding:13px 18px;border-radius:13px;font-weight:600;font-size:14px;color:#fff;box-shadow:0 18px 44px -14px rgba(10,10,30,.45);animation:bsToast .42s cubic-bezier(.2,.9,.3,1.25) both}
        .bs-toast.ok{background:linear-gradient(135deg,var(--accent),var(--accent2,#000))}
        .bs-toast.bad{background:linear-gradient(135deg,#e11d48,#9f1239)}
        .bs-toast svg{width:18px;height:18px}
        @keyframes bsToast{from{opacity:0;transform:translateY(18px) scale(.95)}to{opacity:1;transform:none}}
        .bs-spark{position:absolute;left:14px;top:0;bottom:0;width:0;pointer-events:none}
        .bs-spark i{position:absolute;top:50%;left:0;width:5px;height:5px;border-radius:50%;background:#fff;opacity:0;animation:bsSpark .9s ease-out forwards;animation-delay:calc(var(--d)*60ms)}
        .bs-spark i:nth-child(1){--tx:-34px;--ty:-20px}.bs-spark i:nth-child(2){--tx:-8px;--ty:-28px}.bs-spark i:nth-child(3){--tx:22px;--ty:-22px}
        .bs-spark i:nth-child(4){--tx:-30px;--ty:16px}.bs-spark i:nth-child(5){--tx:10px;--ty:24px}.bs-spark i:nth-child(6){--tx:34px;--ty:6px}
        @keyframes bsSpark{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--tx),var(--ty)) scale(.3)}}
        @media (prefers-reduced-motion:reduce){.bs-sweep,.bs-pulse,.bs-lc,.bs-toast,.bs-spark i{animation:none}}
        /* ---- live preview reacts to template (a=Classic · b=Split · c=Editorial) ---- */
        .pv-frame .pv-cta,.pv-frame .pv-sbtn,.pv-frame .pv-card,.pv-frame .pv-tag,.pv-frame .pv-search,.pv-frame .pv-hero,.pv-frame .pv-head{transition:border-radius .3s ease,padding .3s ease,box-shadow .3s ease,border-color .3s ease}
        .pv-frame[data-template="b"] .pv-cta,.pv-frame[data-template="b"] .pv-sbtn,.pv-frame[data-template="b"] .pv-card,.pv-frame[data-template="b"] .pv-tag,.pv-frame[data-template="b"] .pv-search{border-radius:3px!important}
        .pv-frame[data-template="b"] .pv-head{border-bottom:3px solid var(--pv-acc)}
        .pv-frame[data-template="b"] .pv-hero h3{border-left:4px solid var(--pv-acc);padding-left:9px}
        .pv-frame[data-template="b"] .pv-hero{padding-top:16px!important;padding-bottom:16px!important}
        .pv-frame[data-template="c"] .pv-cta,.pv-frame[data-template="c"] .pv-sbtn,.pv-frame[data-template="c"] .pv-tag,.pv-frame[data-template="c"] .pv-search{border-radius:999px!important}
        .pv-frame[data-template="c"] .pv-card{border-radius:16px!important;box-shadow:0 6px 20px rgba(0,0,0,.08)}
        .pv-frame[data-template="c"] .pv-hero{padding-top:34px!important;padding-bottom:34px!important;border-radius:0 0 22px 22px}
      `}</style>
    </>
  );
}
