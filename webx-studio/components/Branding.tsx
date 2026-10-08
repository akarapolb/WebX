"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import NavManager from "./NavManager";
import FooterEditor from "./FooterEditor";
import BreakingNewsManager from "./BreakingNewsManager";
import ThemeSettings from "./ThemeSettings";

const SWATCHES = ["#2F54EB", "#8B5CF6", "#14B8A6", "#EE5020", "#F59E0B", "#10B981"];
const TMPLS = [{ key: "classic", en: "Classic", th: "คลาสสิก" }, { key: "split", en: "Split", th: "สปลิต" }, { key: "editorial", en: "Editorial", th: "เอดิทอเรียล" }];

export default function Branding() {
  const { t, lang } = useLang();
  const { currentKey, current } = useTenant();
  const [tab, setTab] = useState<"appearance" | "theme" | "nav" | "footer" | "breaking">("appearance");
  const [color, setColor] = useState("#2F54EB");
  const [tmpl, setTmpl] = useState("classic");
  const [wm, setWm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "";

  async function rebuild() {
    try { await fetch("/api/cms/public-site/rebuild", { method: "POST" }); } catch {}
  }

  // load full brand/template/watermark for the current tenant
  useEffect(() => {
    (async () => {
      try {
        const j = await fetch("/api/strapi/api/console/context").then((r) => (r.ok ? r.json() : null));
        const list = j?.tenants ?? j?.data?.tenants ?? [];
        const tn = list.find((x: any) => x.key === currentKey) ?? list[0];
        const c = tn?.brand?.primaryColor || tn?.brand?.color || "#2F54EB";
        setColor(c);
        setTmpl(tn?.template?.key || "classic");
        setWm(Boolean(tn?.watermark?.enabled));
      } catch {}
    })();
  }, [currentKey]);

  function pick(c: string) { setColor(c); }

  async function save() {
    setSaving(true); setMsg(null);
    const body = { brand: { primaryColor: color }, template: { key: tmpl }, watermark: { enabled: wm } };
    try {
      const r = await fetch("/api/strapi/api/console/branding" + (tenant ? "?tenant=" + encodeURIComponent(tenant) : ""), {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setMsg(r.ok ? { t: t("br.saved"), ok: true } : { t: "Save failed (HTTP " + r.status + ")", ok: false });
      if (r.ok) rebuild(); // fire-and-forget, see requestPublicSiteRebuild's own reasoning
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  const brandName = current?.name || "WebX";

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.branding")}</h1><p>{t("br.sub")}</p></div>
        {tab === "appearance" && (
          <div className="vh-act">
            <button className="btn btn--p" onClick={save} disabled={saving}><Icon name="palette" />{saving ? t("br.saving") : t("br.save")}</button>
          </div>
        )}
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={tab === "appearance" ? "on" : ""} onClick={() => setTab("appearance")}>{t("br.tab_appearance")}</button>
        <button className={tab === "theme" ? "on" : ""} onClick={() => setTab("theme")}>{t("br.tab_theme")}</button>
        <button className={tab === "nav" ? "on" : ""} onClick={() => setTab("nav")}>{t("br.tab_nav")}</button>
        <button className={tab === "footer" ? "on" : ""} onClick={() => setTab("footer")}>{t("br.tab_footer")}</button>
        <button className={tab === "breaking" ? "on" : ""} onClick={() => setTab("breaking")}>{t("br.tab_breaking")}</button>
      </div>

      {tab === "appearance" && msg && <div className="panel" style={{ marginBottom: 14 }}><span className={"badge " + (msg.ok ? "b-ok" : "b-warn")}><span className="dot" />{msg.ok ? "OK" : "!"}</span><span style={{ marginLeft: 10, color: msg.ok ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{msg.t}</span></div>}

      {tab === "appearance" && (
        // The public site's own colour lives in --psite-accent, scoped to this
        // subtree — never the admin's own --accent, which every WebX Studio
        // page shares. Setting the tenant's colour here must not re-theme the
        // surrounding admin chrome (buttons, nav, avatar) as a side effect.
        <div className="brand-grid" style={{ "--psite-accent": color } as React.CSSProperties}>
          <div>
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-h"><h3>{t("br.accent")}</h3></div>
              <div className="swatches">
                {SWATCHES.map((s) => <div key={s} className={"sw" + (color.toLowerCase() === s.toLowerCase() ? " on" : "")} style={{ background: s }} onClick={() => pick(s)} />)}
              </div>
              <div className="color-in">
                <input type="color" value={color} onChange={(e) => pick(e.target.value)} />
                <input type="text" value={color} onChange={(e) => pick(e.target.value)} />
              </div>
            </div>
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-h"><h3>{t("br.template")}</h3></div>
              <div className="tmpls">
                {TMPLS.map((tm) => (
                  <div key={tm.key} className={"tmpl" + (tmpl === tm.key ? " on" : "")} onClick={() => setTmpl(tm.key)}>
                    <div className="tmpl-pv"><i style={{ height: 10, width: "50%" }} /><i style={{ height: 6, width: "80%" }} /><i style={{ height: 6, width: "65%" }} /><i style={{ height: 14, width: "40%", marginTop: "auto", background: "var(--psite-accent)" }} /></div>
                    <b>{lang === "th" ? tm.th : tm.en}</b>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="panel-h"><h3>{t("br.watermark")}</h3></div>
              <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 13.5, color: "var(--ink2)" }}>
                <input type="checkbox" checked={wm} onChange={(e) => setWm(e.target.checked)} /> {t("br.wmon")}
              </label>
            </div>
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 9 }}>{t("br.preview")}</div>
            <div className={"preview-site wm" + (wm ? " on" : "")}>
              <div className="psite-bar"><i /><i /><i /><span className="psite-url">{(tenant || "site") + ".go.th"}</span></div>
              <div className="psite-nav"><b>{brandName}</b><span>Home</span><span>Services</span><span>News</span></div>
              <div className="psite-hero" data-wm={brandName.toUpperCase()}>
                <h4>{lang === "th" ? "บริการดิจิทัลเพื่อทุกคน" : "Digital services for everyone"}</h4>
                <p>{lang === "th" ? "ค้นหาบริการ เอกสาร และข้อมูลในที่เดียว" : "Find services, documents and data in one place."}</p>
                <span className="pbtn">{t("br.getstarted")}</span>
              </div>
            </div>
            <div className="notice"><Icon name="spark" /> {t("br.note")}</div>
          </div>
        </div>
      )}

      {tab === "theme" && <ThemeSettings tenantKey={tenant} />}
      {tab === "nav" && <NavManager tenantKey={tenant} />}
      {tab === "footer" && <FooterEditor tenantKey={tenant} />}
      {tab === "breaking" && <BreakingNewsManager tenantKey={tenant} />}
    </>
  );
}
