"use client";
import { useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";

// Self-serve provisioning: create a tenant + seed brand/plan defaults so the new
// workspace is usable immediately and the creator is its admin.
const COLORS = ["#EE5020", "#3B82F6", "#8B5CF6", "#10B981", "#F59E0B"];
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9ก-๙]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const lbl: any = { display: "block", fontSize: 12, color: "var(--muted)", margin: "10px 0 4px" };

export default function NewWorkspace({ userEmail, onClose }: { userEmail: string; onClose: () => void }) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [email, setEmail] = useState(userEmail || "");
  const [color, setColor] = useState(COLORS[0]);
  const [engine, setEngine] = useState<"strapi" | "wordpress">("strapi");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const finalKey = key || slugify(name);

  async function create() {
    if (!name.trim() || !finalKey) { setErr(t("nw.needname")); return; }
    setBusy(true); setErr("");
    const body = {
      key: finalKey, name: name.trim(), active: true, plan: "free", seats: 3, subscriptionStatus: "active",
      adminEmails: email.trim() ? [email.trim()] : [],
      brand: { primaryColor: color, orgName: { th: name.trim(), en: name.trim() } },
      template: { preset: "a", background: "#0b0f17" },
      engine,
    };
    try {
      await cms.entries.create("api::tenant.tenant", body);
      try { localStorage.setItem("webx_tenant", finalKey); } catch {}
      window.location.reload();
    } catch (e) {
      if (e instanceof CmsError) setErr(t("nw.fail") + " (HTTP " + e.status + ")");
      else setErr("Cannot reach the backend.");
      setBusy(false);
    }
  }

  return (
    <div className="scrim" style={{ zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div className="panel" style={{ maxWidth: 440, width: "92%" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}><Icon name="plus" /> {t("nw.title")}</h3>
        <p className="muted" style={{ marginTop: 0 }}>{t("nw.sub")}</p>
        {err && <div className="badge b-warn" style={{ display: "inline-flex", marginBottom: 8 }}><span className="dot" />{err}</div>}

        <label style={lbl}>{t("nw.name")}</label>
        <input className="rv-assignee" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("nw.nameph")} autoFocus />

        <label style={lbl}>{t("nw.key")}</label>
        <input className="rv-assignee" style={{ width: "100%" }} value={finalKey} onChange={(e) => setKey(slugify(e.target.value))} />

        <label style={lbl}>{t("nw.email")}</label>
        <input className="rv-assignee" style={{ width: "100%" }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@org.go.th" />

        <label style={lbl}>{t("nw.color")}</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          {COLORS.map((c) => <button key={c} aria-label={c} onClick={() => setColor(c)} style={{ width: 30, height: 30, borderRadius: 8, background: c, border: color === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer" }} />)}
        </div>

        <label style={lbl}>Content backend</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          {(["strapi", "wordpress"] as const).map((e) => (
            <button key={e} type="button" onClick={() => setEngine(e)}
              className={"btn " + (engine === e ? "btn--p" : "btn--g")} style={{ flex: 1, padding: "6px 0", textTransform: "capitalize" }}>
              {e}
            </button>
          ))}
        </div>
        {engine === "wordpress" && (
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 16 }}>
            The matching wtenant tag in WordPress is created automatically — a WordPress user account for this org still needs to be provisioned separately (Users → Profile → Application Passwords), and today any existing WordPress user can already reach every WordPress-backed workspace.
          </p>
        )}
        {engine === "strapi" && <div style={{ marginBottom: 16 }} />}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn--g" onClick={onClose} disabled={busy}>{t("e.cancel")}</button>
          <button className="btn btn--p" onClick={create} disabled={busy || !name.trim()}>{busy ? t("nw.creating") : t("nw.create")}</button>
        </div>
      </div>
    </div>
  );
}
