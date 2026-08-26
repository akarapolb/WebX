"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9ก-๙]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export default function Signup() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [key, setKey] = useState("");
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const finalKey = key || slugify(orgName);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setErr("Password must be at least 8 characters"); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, key: finalKey, firstname, lastname, email, password }),
      });
      if (r.ok) { router.replace("/dashboard"); router.refresh(); }
      else { const j = await r.json().catch(() => ({})); setErr(j.error || "Could not create your workspace"); setBusy(false); }
    } catch { setErr("Cannot reach the server"); setBusy(false); }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <div className="brand-mark">W</div>
          <div><h1>WebX <span className="gw">Studio</span></h1></div>
        </div>
        <p className="sub">Create your workspace — free, no credit card, you're signed in immediately.</p>
        <p className="auth-err">{err}</p>

        <div className="fld">
          <label htmlFor="orgName">Organization name</label>
          <input id="orgName" type="text" required value={orgName}
            onChange={(e) => setOrgName(e.target.value)} placeholder="Your organization" />
        </div>
        <div className="fld">
          <label htmlFor="key">Workspace URL key</label>
          <input id="key" type="text" required value={finalKey}
            onChange={(e) => setKey(slugify(e.target.value))} placeholder="your-organization" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="fld" style={{ flex: 1 }}>
            <label htmlFor="firstname">First name</label>
            <input id="firstname" type="text" autoComplete="given-name" required value={firstname}
              onChange={(e) => setFirstname(e.target.value)} placeholder="Jane" />
          </div>
          <div className="fld" style={{ flex: 1 }}>
            <label htmlFor="lastname">Last name</label>
            <input id="lastname" type="text" autoComplete="family-name" value={lastname}
              onChange={(e) => setLastname(e.target.value)} placeholder="Doe" />
          </div>
        </div>
        <div className="fld">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@org.go.th" />
        </div>
        <div className="fld">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>

        <button className="btn btn--p" type="submit" disabled={busy}>
          {busy ? "Creating your workspace…" : "Create workspace  →"}
        </button>
        <div className="auth-foot">
          <Icon name="shield" /> Free plan · Strapi engine · upgrade any time
        </div>
        <p className="sub" style={{ textAlign: "center", marginTop: 14 }}>
          Already have a workspace? <a href="/login">Sign in</a>
        </p>
      </form>
    </div>
  );
}
