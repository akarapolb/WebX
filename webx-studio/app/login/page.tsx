"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

const ENGINES = [
  { id: "strapi" as const, label: "Strapi", sub: "Sign in with your Strapi administrator account.", idLabel: "Email", idPlaceholder: "admin@webx.io", idType: "email" as const, pwLabel: "Password", pwPlaceholder: "••••••••" },
  { id: "wordpress" as const, label: "WordPress", sub: "Sign in with your WordPress username and Application Password.", idLabel: "Username", idPlaceholder: "org-editor", idType: "text" as const, pwLabel: "Application Password", pwPlaceholder: "xxxx xxxx xxxx xxxx" },
];

export default function Login() {
  const router = useRouter();
  const [engine, setEngine] = useState<"strapi" | "wordpress">("strapi");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const cfg = ENGINES.find((e) => e.id === engine)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, engine }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.mfaRequired) { setMfaStep(true); setBusy(false); return; }
      if (r.ok) { router.replace("/dashboard"); router.refresh(); }
      else { setErr(j.error || "Sign-in failed"); setBusy(false); }
    } catch { setErr("Cannot reach the server"); setBusy(false); }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/mfa/verify-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: mfaCode }),
      });
      if (r.ok) { router.replace("/dashboard"); router.refresh(); }
      else { const j = await r.json().catch(() => ({})); setErr(j.error || "Verification failed"); setBusy(false); }
    } catch { setErr("Cannot reach the server"); setBusy(false); }
  }

  if (mfaStep) {
    return (
      <div className="auth">
        <form className="auth-card" onSubmit={submitMfa}>
          <div className="auth-logo">
            <div className="brand-mark">W</div>
            <div><h1>WebX <span className="gw">Studio</span></h1></div>
          </div>
          <p className="sub">Enter the 6-digit code from your authenticator app, or a recovery code.</p>
          <p className="auth-err">{err}</p>
          <div className="fld">
            <label htmlFor="mfaCode">Code</label>
            <input id="mfaCode" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus required
              value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="000000" />
          </div>
          <button className="btn btn--p" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Verify  →"}
          </button>
          <div className="auth-foot">
            <Icon name="shield" /> Two-factor authentication
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <div className="brand-mark">W</div>
          <div><h1>WebX <span className="gw">Studio</span></h1></div>
        </div>
        <div role="tablist" aria-label="Backend" style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {ENGINES.map((e) => (
            <button key={e.id} type="button" role="tab" aria-selected={engine === e.id}
              onClick={() => { setEngine(e.id); setErr(""); }}
              className={"btn " + (engine === e.id ? "btn--p" : "btn--g")}
              style={{ flex: 1, padding: "6px 0" }}>
              {e.label}
            </button>
          ))}
        </div>
        <p className="sub">{cfg.sub}</p>
        <p className="auth-err">{err}</p>
        <div className="fld">
          <label htmlFor="email">{cfg.idLabel}</label>
          <input id="email" type={cfg.idType} autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder={cfg.idPlaceholder} />
        </div>
        <div className="fld">
          <label htmlFor="password">{cfg.pwLabel}</label>
          <input id="password" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder={cfg.pwPlaceholder} />
        </div>
        <button className="btn btn--p" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in  →"}
        </button>
        <div className="auth-foot">
          <Icon name="shield" /> Secured with httpOnly session · token never touches the browser
        </div>
        {engine === "strapi" && (
          <p className="sub" style={{ textAlign: "center", marginTop: 14 }}>
            No workspace yet? <a href="/signup">Create one free</a>
          </p>
        )}
      </form>
    </div>
  );
}
