"use client";
// Workspace-admin-only: require every admin in this workspace to turn on
// two-factor authentication. Off by default (see governance.ts's own
// saveMfaRequirement/mfaEnforcementStatus) — this component only ever shows
// up for a genuine workspace administrator (not someone acting under a
// custom role), same rule the save call itself enforces server-side.
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";

type Settings = { mfaRequired: boolean; mfaRequiredAt: string | null; graceDays: number; isAdmin: boolean; ssoEnabled: boolean };

export default function MfaRequirement() {
  const { t, lang } = useLang();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/cms/security").then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => setS(null));
  }, []);

  async function toggle() {
    if (!s) return;
    const next = !s.mfaRequired;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/cms/security", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mfaRequired: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "Save failed"); setBusy(false); return; }
      setS((cur) => (cur ? { ...cur, mfaRequired: next, mfaRequiredAt: next ? (cur.mfaRequiredAt || new Date().toISOString()) : cur.mfaRequiredAt } : cur));
    } catch { setErr("Cannot reach the backend."); }
    setBusy(false);
  }

  if (!s || !s.isAdmin) return null;

  const deadline = s.mfaRequiredAt
    ? new Date(Date.parse(s.mfaRequiredAt) + s.graceDays * 86_400_000).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium" })
    : "";

  return (
    <div className="panel" style={{ marginBottom: 16 }} data-testid="mfa-requirement">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Icon name="shield" />
        <h3 style={{ margin: 0 }}>{t("sec.req.title")}</h3>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{t("sec.req.desc")}</p>

      {s.ssoEnabled ? (
        <div className="badge b-mut" style={{ display: "inline-flex" }}><span className="dot" />{t("sec.req.sso")}</div>
      ) : (
        <>
          <div className="badge" style={{ display: "inline-flex" }} data-testid="mfa-requirement-status">
            <span className="dot" />
            {s.mfaRequired ? t("sec.req.on").replace("{date}", deadline) : t("sec.req.off")}
          </div>
          {err && <p className="badge b-warn" style={{ marginTop: 10 }}><span className="dot" />{err}</p>}
          <div style={{ marginTop: 14 }}>
            <button className={"btn " + (s.mfaRequired ? "btn--g" : "btn--p")} onClick={toggle} disabled={busy} data-testid="mfa-requirement-toggle">
              {busy ? t("sec.req.saving") : t(s.mfaRequired ? "sec.req.disable" : "sec.req.enable")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
