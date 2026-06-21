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

export default function Shell({
  user, connected, children,
}: {
  user: { email: string; name: string };
  connected: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { tenants, currentKey, setCurrentKey, current } = useTenant();
  const [tenOpen, setTenOpen] = useState(false);
  const [nwOpen, setNwOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [cmdk, setCmdk] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdk(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      <aside className="sb">
        <div className="sb-top">
          <div className="brand">
            <div className="brand-mark">W</div>
            <div className="brand-name">WebX Studio<small>Multi-tenant CMS</small></div>
          </div>
          <div className="ten">
            <button className="ten-btn" onClick={() => setTenOpen((o) => !o)}>
              <span className="ten-dot">{current?.name?.[0]?.toUpperCase() ?? "W"}</span>
              <span className="ten-meta"><b>{current?.name}</b><span>{current?.plan}</span></span>
              <Icon name="chevron" />
            </button>
            {tenOpen && (
              <div className="ten-pop">
                {tenants.map((tn) => (
                  <button key={tn.key} className="ten-item" onClick={() => { setCurrentKey(tn.key); setTenOpen(false); }}>
                    <span className="ten-dot">{tn.name[0]?.toUpperCase()}</span>
                    <b>{tn.name}</b><span>{tn.key === currentKey ? "●" : ""}</span>
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

        <div className="sb-foot">
          <div className="upsell">
            <b>{t("up.title")}</b>
            <p>{t("up.sub")}</p>
            <button onClick={() => router.push("/branding")}>{t("up.btn")}</button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="tb">
          <button className="searchbtn" onClick={() => setCmdk(true)}>
            <Icon name="search" /><span className="ph">{t("tb.search")}</span><span className="kbd">⌘K</span>
          </button>
          <div className="tb-sp" />
          <button className="ic-btn" title="Notifications"><Icon name="bell" /></button>
          <button className="ic-btn" title="Theme" onClick={toggleTheme}><Icon name="moon" /></button>
          <div className="lang-tg">
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
            <button className={lang === "th" ? "on" : ""} onClick={() => setLang("th")}>ไทย</button>
          </div>
          <div className="demo-pill"><i /> {connected ? t("tb.connected") : t("tb.offline")}</div>
          <button className="ic-btn" title="Sign out" onClick={logout}><Icon name="logout" /></button>
          <div className="avatar" title={user.email}>{initials}</div>
        </header>
        <div className="page">{children}</div>
      </div>

      <CommandPalette open={cmdk} onClose={() => setCmdk(false)} onToggleTheme={toggleTheme} onLogout={logout} />
      {nwOpen && <NewWorkspace userEmail={user.email} onClose={() => setNwOpen(false)} />}
    </div>
  );
}
