"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import MfaRequirement from "./MfaRequirement";

const lbl: any = { display: "block", fontSize: 12, color: "var(--muted)", margin: "10px 0 4px" };

type Step = "loading" | "off" | "enrolling" | "recovery" | "on";

export default function Security({ onEnabled }: { onEnabled?: () => void } = {}) {
  const { t, lang } = useLang();
  const [step, setStep] = useState<Step>("loading");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [copied, setCopied] = useState(false);
  // Reminder when this workspace requires MFA and the caller hasn't enabled
  // it yet — same governance.ts call the app layout uses to decide whether
  // to block. Only fetched when relevant: an already-on account skips it
  // entirely (see the effect below).
  const [required, setRequired] = useState<{ deadline: string | null; overdue: boolean } | null>(null);

  async function loadStatus() {
    try {
      const r = await fetch("/api/cms/mfa/status");
      const j = await r.json();
      setStep(j.enabled ? "on" : "off");
      if (!j.enabled) {
        const rr = await fetch("/api/cms/security/status").then((res) => (res.ok ? res.json() : null)).catch(() => null);
        if (rr?.required) setRequired({ deadline: rr.deadline, overdue: rr.overdue });
      }
    } catch { setStep("off"); }
  }
  useEffect(() => { loadStatus(); }, []);

  async function startEnroll() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/cms/mfa/start", { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Could not start enrollment"); setBusy(false); return; }
      setSecret(j.secret); setOtpauth(j.otpauthUri); setStep("enrolling");
    } catch { setErr("Cannot reach the server"); }
    setBusy(false);
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/cms/mfa/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Incorrect code"); setBusy(false); return; }
      setRecoveryCodes(j.recoveryCodes); setStep("recovery"); setCode(""); setRequired(null);
      // MFA is already active server-side at this point (confirmMfaEnrollment
      // already ran) — but onEnabled fires only once the user acknowledges
      // the recovery codes (the "Done" button below), not here: a blocking
      // caller (Shell.tsx) unmounts this component the instant it fires, which
      // would yank the once-only recovery-codes screen away before it's seen.
    } catch { setErr("Cannot reach the server"); }
    setBusy(false);
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/cms/mfa/disable", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: disablePassword }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Could not disable"); setBusy(false); return; }
      setDisablePassword(""); setStep("off");
    } catch { setErr("Cannot reach the server"); }
    setBusy(false);
  }

  function copySecret() {
    navigator.clipboard?.writeText(secret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.security")}</h1><p>{t("sec.sub")}</p></div>
      </div>

      <MfaRequirement />

      {required && step === "off" && (
        <div className={"panel " + (required.overdue ? "mfa-nag mfa-nag--overdue" : "mfa-nag")} data-testid="mfa-requirement-reminder">
          <span className={"badge " + (required.overdue ? "b-warn" : "b-mut")}><span className="dot" />
            {required.deadline
              ? t(required.overdue ? "sec.req.overdue" : "sec.req.reminder").replace("{date}", new Date(required.deadline).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium" }))
              : t("sec.req.reminderNoDate")}
          </span>
        </div>
      )}

      {err && <div className="panel" style={{ marginBottom: 16 }}><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}

      {step === "loading" && <div className="panel"><span className="muted">{t("sec.loading")}</span></div>}

      {step === "off" && (
        <div className="panel">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span className="badge b-mut"><span className="dot" />{t("sec.off")}</span>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>{t("sec.offDesc")}</p>
          <button className="btn btn--p" onClick={startEnroll} disabled={busy} data-testid="mfa-enable">
            <Icon name="lock" /> {busy ? t("sec.starting") : t("sec.enable")}
          </button>
        </div>
      )}

      {step === "enrolling" && (
        <div className="panel" style={{ maxWidth: 480 }}>
          <h3 style={{ marginTop: 0 }}>{t("sec.scanTitle")}</h3>
          <p className="muted">{t("sec.scanDesc")}</p>
          <div className="mono" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            background: "var(--panel-2, rgba(255,255,255,0.06))", border: "1px solid var(--line, rgba(255,255,255,0.12))",
            borderRadius: 8, padding: "10px 12px", fontSize: 16, letterSpacing: 1, margin: "12px 0",
          }}>
            <span>{secret.match(/.{1,4}/g)?.join(" ")}</span>
            <button className="btn btn--g" style={{ padding: "4px 10px" }} onClick={copySecret}>
              <Icon name={copied ? "check" : "copy"} /> {copied ? t("u.copied") : t("u.copy")}
            </button>
          </div>
          <details style={{ marginBottom: 14 }}>
            <summary className="muted" style={{ cursor: "pointer", fontSize: 12.5 }}>{t("sec.showUri")}</summary>
            <div className="mono" style={{ fontSize: 11, wordBreak: "break-all", marginTop: 6, color: "var(--muted)" }}>{otpauth}</div>
          </details>
          <form onSubmit={confirmEnroll}>
            <label style={lbl}>{t("sec.enterCode")}</label>
            <input className="rv-assignee" style={{ width: "100%" }} inputMode="numeric" autoFocus required data-testid="mfa-code-input"
              value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn--g" onClick={() => setStep("off")} disabled={busy}>{t("e.cancel")}</button>
              <button type="submit" className="btn btn--p" disabled={busy} data-testid="mfa-confirm">{busy ? t("sec.verifying") : t("sec.confirm")}</button>
            </div>
          </form>
        </div>
      )}

      {step === "recovery" && (
        <div className="panel" style={{ maxWidth: 480 }}>
          <h3 style={{ marginTop: 0 }}><Icon name="lock" /> {t("sec.recoveryTitle")}</h3>
          <p className="muted">{t("sec.recoveryDesc")}</p>
          <div className="mono" style={{
            background: "var(--panel-2, rgba(255,255,255,0.06))", border: "1px solid var(--line, rgba(255,255,255,0.12))",
            borderRadius: 8, padding: "14px 16px", fontSize: 14, lineHeight: 1.9, margin: "12px 0",
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px",
          }}>
            {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="badge b-warn" style={{ display: "inline-flex", marginBottom: 16 }}>
            <span className="dot" />{t("sec.recoveryWarn")}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn--p" onClick={() => { setStep("on"); onEnabled?.(); }} data-testid="mfa-recovery-done">{t("u.done")}</button>
          </div>
        </div>
      )}

      {step === "on" && (
        <div className="panel" style={{ maxWidth: 480 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span className="badge b-ok"><span className="dot" />{t("sec.on")}</span>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>{t("sec.onDesc")}</p>
          <form onSubmit={disable}>
            <label style={lbl}>{t("sec.disablePassword")}</label>
            <input className="rv-assignee" style={{ width: "100%" }} type="password" required data-testid="mfa-disable-password"
              value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder="••••••••" />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button type="submit" className="btn btn--g" disabled={busy} data-testid="mfa-disable">{busy ? t("sec.disabling") : t("sec.disable")}</button>
            </div>
          </form>
        </div>
      )}

      <div className="notice"><Icon name="shield" /> {t("sec.foot")}</div>
    </>
  );
}
