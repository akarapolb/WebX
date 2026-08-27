"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";

const lbl: any = { display: "block", fontSize: 12, color: "var(--muted)", margin: "10px 0 4px" };

export default function SsoSettings() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const [enabled, setEnabled] = useState(false);
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState(""); // blank on save = keep existing
  const [hasSecret, setHasSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState("");
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "";

  useEffect(() => {
    if (!tenant) { setLoading(false); return; }
    setLoading(true);
    fetch("/api/cms/sso?tenant=" + encodeURIComponent(tenant))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) {
          setEnabled(Boolean(j.enabled)); setIssuerUrl(j.issuerUrl || ""); setClientId(j.clientId || "");
          setHasSecret(Boolean(j.hasSecret));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenant]);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/cms/sso?tenant=" + encodeURIComponent(tenant), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, issuerUrl, clientId, clientSecret: clientSecret || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? { t: t("sso.saved"), ok: true } : { t: j.error || "Save failed", ok: false });
      if (r.ok) { setClientSecret(""); if (clientSecret) setHasSecret(true); }
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  function copy(key: string, value: string) {
    navigator.clipboard?.writeText(value).then(() => { setCopied(key); setTimeout(() => setCopied(""), 1500); });
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirectUri = origin + "/api/auth/sso/callback";
  const loginLink = origin + "/login?tenant=" + encodeURIComponent(tenant);

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.sso")}</h1><p>{t("sso.sub")}</p></div>
        <div className="vh-act">
          <button className="btn btn--p" onClick={save} disabled={saving || loading || !tenant}>
            <Icon name="lock" />{saving ? t("sso.saving") : t("sso.save")}
          </button>
        </div>
      </div>

      {msg && <div className="panel" style={{ marginBottom: 14 }}><span className={"badge " + (msg.ok ? "b-ok" : "b-warn")}><span className="dot" />{msg.ok ? "OK" : "!"}</span><span style={{ marginLeft: 10, color: msg.ok ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{msg.t}</span></div>}

      {loading ? (
        <div className="panel"><span className="muted">{t("sso.loading")}</span></div>
      ) : (
        <div className="panel" style={{ maxWidth: 520 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 13.5, color: "var(--ink2)", marginBottom: 4 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {t("sso.enabled")}
          </label>

          <label style={lbl}>{t("sso.issuer")}</label>
          <input className="rv-assignee" style={{ width: "100%" }} type="text" value={issuerUrl}
            onChange={(e) => setIssuerUrl(e.target.value)} placeholder="https://keycloak.example.com/realms/your-realm" />

          <label style={lbl}>{t("sso.clientId")}</label>
          <input className="rv-assignee" style={{ width: "100%" }} type="text" value={clientId}
            onChange={(e) => setClientId(e.target.value)} placeholder="webx-studio" />

          <label style={lbl}>{t("sso.clientSecret")}</label>
          <input className="rv-assignee" style={{ width: "100%" }} type="password" value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)} placeholder={hasSecret ? t("sso.clientSecretSaved") : "••••••••"} />

          <label style={lbl}>{t("sso.redirectUri")}</label>
          <div className="mono" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            background: "var(--panel-2, rgba(255,255,255,0.06))", border: "1px solid var(--line, rgba(255,255,255,0.12))",
            borderRadius: 8, padding: "8px 10px", fontSize: 12.5, wordBreak: "break-all",
          }}>
            <span>{redirectUri}</span>
            <button type="button" className="btn btn--g" style={{ padding: "4px 10px", flexShrink: 0 }} onClick={() => copy("redirect", redirectUri)}>
              <Icon name={copied === "redirect" ? "check" : "copy"} /> {copied === "redirect" ? t("u.copied") : t("u.copy")}
            </button>
          </div>

          {enabled && tenant && (
            <>
              <label style={lbl}>{t("sso.loginLink")}</label>
              <div className="mono" style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                background: "var(--panel-2, rgba(255,255,255,0.06))", border: "1px solid var(--line, rgba(255,255,255,0.12))",
                borderRadius: 8, padding: "8px 10px", fontSize: 12.5, wordBreak: "break-all",
              }}>
                <span>{loginLink}</span>
                <button type="button" className="btn btn--g" style={{ padding: "4px 10px", flexShrink: 0 }} onClick={() => copy("login", loginLink)}>
                  <Icon name={copied === "login" ? "check" : "copy"} /> {copied === "login" ? t("u.copied") : t("u.copy")}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="notice"><Icon name="shield" /> {t("sso.foot")}</div>
    </>
  );
}
