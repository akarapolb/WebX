"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";

const ENGINES = [
  { id: "strapi" as const, label: "Strapi", sub: "Sign in with your Strapi administrator account.", idLabel: "Email", idPlaceholder: "admin@webx.io", idType: "email" as const, pwLabel: "Password", pwPlaceholder: "••••••••" },
  { id: "wordpress" as const, label: "WordPress", sub: "Sign in with your WordPress username and Application Password.", idLabel: "Username", idPlaceholder: "org-editor", idType: "text" as const, pwLabel: "Application Password", pwPlaceholder: "xxxx xxxx xxxx xxxx" },
];

const SSO_ERRORS: Record<string, string> = {
  missing_tenant: "No workspace specified for SSO sign-in.",
  sso_disabled: "SSO isn't enabled for this workspace.",
  sso_expired: "Your sign-in attempt expired — please try again.",
  sso_failed: "SSO sign-in failed — please try again or contact an administrator.",
};

function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ssoTenant = searchParams.get("tenant") || "";
  const nextParam = searchParams.get("next") || "";
  const [engine, setEngine] = useState<"strapi" | "wordpress">("strapi");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [ssoAvailable, setSsoAvailable] = useState(false);
  const cfg = ENGINES.find((e) => e.id === engine)!;

  useEffect(() => {
    const errParam = searchParams.get("error");
    if (errParam) setErr(SSO_ERRORS[errParam] || errParam);
  }, [searchParams]);

  useEffect(() => {
    if (!ssoTenant) { setSsoAvailable(false); return; }
    fetch("/api/auth/sso/status?tenant=" + encodeURIComponent(ssoTenant))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSsoAvailable(Boolean(j?.enabled)))
      .catch(() => setSsoAvailable(false));
  }, [ssoTenant]);

  const ssoLoginHref = "/api/auth/sso/login?tenant=" + encodeURIComponent(ssoTenant) + (nextParam ? "&next=" + encodeURIComponent(nextParam) : "");

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
          <div className="fld ic">
            <label htmlFor="mfaCode">Code</label>
            <Icon name="hash" />
            <input id="mfaCode" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus required
              value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="000000" />
          </div>
          <button className="btn btn--p" type="submit" disabled={busy}>
            {busy ? "Verifying…" : <>Verify <Icon name="arrow" className="ic-arrow" /></>}
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
        {ssoAvailable && (
          <>
            <a href={ssoLoginHref} className="btn btn--p" style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <Icon name="lock" /> Continue with SSO
            </a>
            <div className="sub" style={{ textAlign: "center", marginBottom: 14 }}>or sign in with a password</div>
          </>
        )}
        <div className="auth-seg" role="tablist" aria-label="Backend">
          {ENGINES.map((e) => (
            <button key={e.id} type="button" role="tab" aria-selected={engine === e.id}
              onClick={() => { setEngine(e.id); setErr(""); }}>
              {e.label}
            </button>
          ))}
        </div>
        <p className="sub">{cfg.sub}</p>
        <p className="auth-err">{err}</p>
        <div className="fld ic">
          <label htmlFor="email">{cfg.idLabel}</label>
          <Icon name={engine === "wordpress" ? "user" : "mail"} />
          <input id="email" type={cfg.idType} autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder={cfg.idPlaceholder} />
        </div>
        <div className="fld ic">
          <label htmlFor="password">{cfg.pwLabel}</label>
          <Icon name="lock" />
          <input id="password" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder={cfg.pwPlaceholder} />
        </div>
        <button className="btn btn--p" type="submit" disabled={busy}>
          {busy ? "Signing in…" : <>Sign in <Icon name="arrow" className="ic-arrow" /></>}
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}
