"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (r.ok) { router.replace("/dashboard"); router.refresh(); }
      else { const j = await r.json().catch(() => ({})); setErr(j.error || "Sign-in failed"); setBusy(false); }
    } catch { setErr("Cannot reach the server"); setBusy(false); }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <div className="brand-mark">W</div>
          <div><h1>WebX <span className="gw">Studio</span></h1></div>
        </div>
        <p className="sub">Sign in with your Strapi administrator account.</p>
        <p className="auth-err">{err}</p>
        <div className="fld">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="admin@webx.io" />
        </div>
        <div className="fld">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn btn--p" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in  →"}
        </button>
        <div className="auth-foot">
          <Icon name="shield" /> Secured with httpOnly session · token never touches the browser
        </div>
      </form>
    </div>
  );
}
