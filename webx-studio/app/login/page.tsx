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

  const feats = [
    "Multi-tenant core — one platform, every brand",
    "Every language, out of the box (i18n)",
    "AI-native search & content authoring",
    "Edge-fast — and beautiful to operate",
  ];

  return (
    <div className="lg">
      <aside className="lg-brand">
        <img src="/webx-logo.png" alt="WebX Studio" className="lg-logo" />
        <div className="lg-brand-mid">
          <h1 className="lg-h1">Headless CMS,<br />reimagined.</h1>
          <p className="lg-tag">
            WebX Studio runs every brand, in every language, on one multi-tenant
            core — AI-native, edge-fast, and beautiful to operate.
          </p>
          <ul className="lg-feats">
            {feats.map((f) => (
              <li key={f}><span className="d">✓</span>{f}</li>
            ))}
          </ul>
        </div>
        <div className="lg-brand-foot">© 2026 WebX Studio · Enterprise-grade content platform</div>
      </aside>

      <main className="lg-form">
        <form className="lg-card" onSubmit={submit}>
          <h2 className="lg-title">Welcome back</h2>
          <p className="lg-sub">Sign in to your workspace to continue.</p>
          <p className="lg-err">{err}</p>
          <div className="lg-fld">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@agency.go.th" />
          </div>
          <div className="lg-fld">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="lg-btn" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="lg-foot">
            <Icon name="shield" /> Protected by enterprise-grade encrypted sessions
          </div>
        </form>
      </main>
    </div>
  );
}
