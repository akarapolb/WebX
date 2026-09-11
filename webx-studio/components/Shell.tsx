"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "./Icon";
import CommandPalette from "./CommandPalette";
import NewWorkspace from "./NewWorkspace";
import { NAV } from "@/lib/nav";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { useAgent } from "./agent/AgentProvider";
import AgentPanel from "./agent/AgentPanel";
import JobsIndicator from "./agent/JobsIndicator";
import Security from "./Security";

type MfaEnforcement = { required: boolean; enrolled: boolean; deadline: string | null; overdue: boolean } | null;

export default function Shell({
  user, connected, children, mfaEnforcement,
}: {
  user: { email: string; name: string };
  connected: boolean;
  children: React.ReactNode;
  /** Per-tenant "require MFA" (governance.ts's mfaEnforcementStatus), resolved once by the layout. Null off the Strapi engine or on lookup failure — never blocks in that case. */
  mfaEnforcement?: MfaEnforcement;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { tenants, currentKey, setCurrentKey, current, engine } = useTenant();
  const agent = useAgent();
  // Local copy so enrolling can lift the block immediately (Security's
  // onEnabled) without waiting for a full navigation to re-run the layout.
  const [mfa, setMfa] = useState(mfaEnforcement ?? null);
  useEffect(() => { setMfa(mfaEnforcement ?? null); }, [mfaEnforcement]);
  const onSecurityPage = pathname === "/account/security";
  const mfaBlocked = Boolean(mfa?.overdue) && !onSecurityPage;
  const [tenOpen, setTenOpen] = useState(false);
  const [nwOpen, setNwOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [cmdk, setCmdk] = useState(false);
  // Mobile nav drawer (<720px, see globals.css's .sb.open) — below that
  // width the sidebar used to just display:none with no replacement at
  // all, so a phone-width admin lost every nav link (TOR §4.4.1.1(2)
  // requires the admin stay usable on mobile). Auto-closes on navigation.
  const [sbOpen, setSbOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdk(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { setSbOpen(false); }, [pathname]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); document.documentElement.setAttribute("data-theme", next);
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login"); router.refresh();
  }

  const initials = user.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "WX";
  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <div className="shell">
      <div className={sbOpen ? "sb-backdrop show" : "sb-backdrop"} onClick={() => setSbOpen(false)} />
      <aside className={sbOpen ? "sb open" : "sb"}>
        <div className="sb-top">
          <div className="ten">
            <div className="ten-row">
              <button className="ten-btn" onClick={() => setTenOpen((o) => !o)}>
                <span className="ten-dot">{current?.name?.[0]?.toUpperCase() ?? "W"}</span>
                <span className="ten-meta"><b>{current?.name}</b></span>
                <Icon name="chevron" />
              </button>
              <button className="ic-btn sb-close" title="Close menu" onClick={() => setSbOpen(false)}><Icon name="close" /></button>
            </div>
            {tenOpen && (
              <div className="ten-pop">
                {tenants.map((tn) => (
                  <button key={tn.key} className="ten-item" onClick={() => { setCurrentKey(tn.key); setTenOpen(false); }}>
                    <span className="ten-dot">{tn.name[0]?.toUpperCase()}</span>
                    <b>{tn.name}</b><span className="ten-check">{tn.key === currentKey ? "●" : ""}</span>
                  </button>
                ))}
                <button className="ten-item" style={{ borderTop: "1px solid var(--line)", color: "var(--acc, #EE5020)" }} onClick={() => { setNwOpen(true); setTenOpen(false); }}>
                  <span className="ten-dot"><Icon name="plus" /></span><b>{t("nw.title")}</b>
                </button>
              </div>
            )}
          </div>
        </div>

        <nav className="nav">
          {groups.map((g) => (
            <div key={g}>
              <div className="nav-h">{t("group." + g)}</div>
              {NAV.filter((n) => n.group === g).map((n) => {
                const active = pathname.startsWith("/" + n.id);
                return (
                  <Link key={n.id} href={"/" + n.id} className={active ? "on" : ""}>
                    <Icon name={n.icon} /><span>{t("nav." + n.id)}</span><span className="kn">{n.k}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

      </aside>

      <div className="main">
        <header className="tb">
          <button className="ic-btn tb-hamburger" title="Menu" onClick={() => setSbOpen(true)}><Icon name="menu" /></button>
          <button className="searchbtn" onClick={() => setCmdk(true)}>
            <Icon name="search" /><span className="ph">{t("tb.search")}</span><span className="kbd">⌘K</span>
          </button>
          <div className="tb-sp" />
          <JobsIndicator />
          {agent.policy && agent.policy.level !== "off" && (
            <button className={"agent-tg" + (agent.open ? " on" : "")} onClick={agent.toggle} data-testid="agent-toggle">
              <Icon name="spark" /><span>{t("ag.toggleTitle")}</span><span className="kbd">⌘J</span>
            </button>
          )}
          <button className="ic-btn" title="Notifications"><Icon name="bell" /></button>
          <button className="ic-btn" title="Theme" onClick={toggleTheme}><Icon name="moon" /></button>
          <div className="lang-tg">
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
            <button className={lang === "th" ? "on" : ""} onClick={() => setLang("th")}>ไทย</button>
          </div>
          <div className="demo-pill"><i /> {connected ? (engine === "wordpress" ? (lang === "th" ? "WORDPRESS · เชื่อมต่อแล้ว" : "WORDPRESS · CONNECTED") : t("tb.connected")) : t("tb.offline")}</div>
          <button className="ic-btn" title="Security" onClick={() => router.push("/account/security")}><Icon name="lock" /></button>
          <button className="ic-btn" title="Sign out" onClick={logout}><Icon name="logout" /></button>
          <div className="avatar" title={user.email}>{initials}</div>
        </header>
        {mfa?.required && !mfa.enrolled && !mfa.overdue && (
          <div className="mfa-banner" data-testid="mfa-banner">
            <Icon name="shield" />
            <span>
              {t("sec.req.reminder").replace("{date}", mfa.deadline ? new Date(mfa.deadline).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium" }) : "")}
            </span>
            <button className="btn btn--p btn-sm" onClick={() => router.push("/account/security")}>{t("sec.req.cta")}</button>
          </div>
        )}
        <div className="body">
          {mfaBlocked ? (
            <div className="page mfa-block" data-testid="mfa-block">
              <div className="mfa-block-inner">
                <div className="mfa-block-h"><Icon name="shield" /><h2>{t("sec.req.blockTitle")}</h2></div>
                <p className="lead">{t("sec.req.blockDesc")}</p>
                <Security onEnabled={() => setMfa((m) => (m ? { ...m, overdue: false, enrolled: true } : m))} />
              </div>
            </div>
          ) : (
            <div className="page">{children}</div>
          )}
          <AgentPanel />
        </div>
      </div>

      <CommandPalette open={cmdk} onClose={() => setCmdk(false)} onToggleTheme={toggleTheme} onLogout={logout} />
      {nwOpen && <NewWorkspace userEmail={user.email} onClose={() => setNwOpen(false)} />}
    </div>
  );
}
