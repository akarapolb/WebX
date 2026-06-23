"use client";
import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Icon from "./Icon";
import CommandPalette from "./CommandPalette";
import NewWorkspace from "./NewWorkspace";
import { NAV, CONTENT_MENUS } from "@/lib/nav";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";

function tenantColor(key?: string) {
  if (!key) return "linear-gradient(135deg,#6366F1,#8B5CF6)";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `linear-gradient(135deg,hsl(${h} 66% 56%),hsl(${(h + 42) % 360} 66% 48%))`;
}

export default function Shell({
  user, connected, children,
}: {
  user: { email: string; name: string };
  connected: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const curType = search.get("type");
  const onContent = pathname.startsWith("/content");
  // which content menu owns the type currently being viewed (default: "content" for /content with no ?type=)
  const activeMenu = curType
    ? (CONTENT_MENUS.find((m) => m.types.some((ty) => ty.api === curType))?.id ?? null)
    : (onContent ? "content" : null);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => (activeMenu ? { [activeMenu]: true } : {}));
  const toggleMenu = (id: string) => setOpenMenus((o) => ({ ...o, [id]: !o[id] }));
  const [formsPending, setFormsPending] = useState(0);
  const { t, lang, setLang } = useLang();
  const { tenants, currentKey, setCurrentKey, current } = useTenant();
  const [tenOpen, setTenOpen] = useState(false);
  const [tenQuery, setTenQuery] = useState("");
  const [nwOpen, setNwOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [cmdk, setCmdk] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const tenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { if (localStorage.getItem("webx_sb_collapsed") === "1") setCollapsed(true); } catch {}
  }, []);

  useEffect(() => { if (activeMenu) setOpenMenus((o) => (o[activeMenu] ? o : { ...o, [activeMenu]: true })); }, [activeMenu]);

  // pending citizen-submission count → badge on the Forms nav item
  useEffect(() => {
    let alive = true;
    const tk = currentKey && currentKey !== "workspace" ? "&filters[tenant][key][$eq]=" + encodeURIComponent(currentKey) : "";
    const F: [string, string][] = [
      ["api::complaint.complaint", "filters[stage][$lt]=3"],
      ["api::application.application", "filters[stage][$lt]=3"],
      ["api::contact-message.contact-message", "filters[handled][$eq]=false"],
      ["api::registration.registration", "filters[verified][$eq]=false"],
    ];
    (async () => {
      const counts = await Promise.all(F.map(async ([uid, pf]) => {
        try {
          const r = await fetch("/api/strapi/content-manager/collection-types/" + uid + "?page=1&pageSize=1&" + pf + tk);
          return r.ok ? ((await r.json()).pagination?.total ?? 0) : 0;
        } catch { return 0; }
      }));
      if (alive) setFormsPending(counts.reduce((a, b) => a + b, 0));
    })();
    return () => { alive = false; };
  }, [currentKey]);

  useEffect(() => {
    if (!tenOpen) return;
    function onDown(e: MouseEvent) {
      if (tenRef.current && !tenRef.current.contains(e.target as Node)) setTenOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [tenOpen]);

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
  function toggleCollapse() {
    setCollapsed((c) => { const n = !c; try { localStorage.setItem("webx_sb_collapsed", n ? "1" : "0"); } catch {} return n; });
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login"); router.refresh();
  }

  const initials = user.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "WX";
  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <div className={"shell" + (collapsed ? " sb-collapsed" : "")}>
      <aside className="sb">
        <button className="sb-collapse" onClick={toggleCollapse} aria-label="Toggle sidebar" title="ย่อ/ขยายเมนู">
          <svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="sb-top">
          <div className="brand">
            <img src="/webx-mark.png" alt="WebX" className="brand-ic" />
            <div className="brand-tx"><b>WebX</b> Studio</div>
          </div>
          <div className="ten" ref={tenRef}>
            <button className="ten-btn" onClick={() => { setTenQuery(""); setTenOpen((o) => !o); }}>
              <span className="ten-dot" style={{ background: tenantColor(current?.key) }}>{current?.name?.[0]?.toUpperCase() ?? "W"}</span>
              <span className="ten-meta"><b>{current?.name}</b><span>{lang === "th" ? "พื้นที่ทำงาน" : "Workspace"}</span></span>
              <Icon name="chevron" />
            </button>
            {tenOpen && (
              <div className="ten-pop">
                <div className="ten-user">
                  <b>{user.name}</b>
                  <span>{user.email}</span>
                </div>
                <div className="ten-div" />
                {tenants.length > 6 && (
                  <div className="ten-search">
                    <svg viewBox="0 0 24 24" fill="none"><path d="m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    <input autoFocus value={tenQuery} onChange={(e) => setTenQuery(e.target.value)} placeholder={lang === "th" ? "ค้นหา…" : "Search…"} />
                  </div>
                )}
                <div className="ten-list">
                  {tenants.filter((tn) => tn.name.toLowerCase().includes(tenQuery.toLowerCase())).map((tn) => (
                    <button key={tn.key} className={"ten-item" + (tn.key === currentKey ? " on" : "")} onClick={() => { setCurrentKey(tn.key); setTenOpen(false); }}>
                      <span className="ten-dot" style={{ background: tenantColor(tn.key) }}>{tn.name[0]?.toUpperCase()}</span>
                      <b className="ten-name">{tn.name}</b>
                      {tn.key === currentKey && (
                        <svg className="ten-check" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                    </button>
                  ))}
                  {tenants.filter((tn) => tn.name.toLowerCase().includes(tenQuery.toLowerCase())).length === 0 && (
                    <div className="ten-empty">{lang === "th" ? "ไม่พบพื้นที่ทำงาน" : "No workspaces found"}</div>
                  )}
                </div>
                <button className="ten-item" onClick={() => { setNwOpen(true); setTenOpen(false); }}>
                  <span className="ten-dot" style={{ background: "var(--accent)", fontSize: 17 }}>+</span>
                  <b className="ten-name">{t("nw.title")}</b>
                </button>
                <div className="ten-div" />
                <button className="ten-logout" onClick={() => { setTenOpen(false); logout(); }}>
                  <span className="ten-lic"><svg viewBox="0 0 24 24" fill="none"><path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M14 4h3a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  {lang === "th" ? "ออกจากระบบ" : "Log Out"}
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
                if (n.id === "content") {
                  return CONTENT_MENUS.map((m) => {
                    const open = !!openMenus[m.id];
                    const menuActive = activeMenu === m.id;
                    return (
                      <div key={m.id} className={"nav-exp" + (open ? " open" : "")}>
                        <div className={"nav-exp-row" + (menuActive ? " on" : "")}>
                          <button className="nav-exp-main" onClick={() => toggleMenu(m.id)}>
                            <Icon name={m.icon} /><span>{lang === "th" ? m.th : m.en}</span>
                          </button>
                          <button className="nav-exp-tg" onClick={() => toggleMenu(m.id)} aria-label="Toggle menu">
                            <svg viewBox="0 0 24 24" fill="none"><path d="M8 9l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                        </div>
                        {open && !collapsed && (
                          <div className="nav-sub">
                            {m.types.map((ty) => {
                              const tyActive = curType === ty.api || (m.id === "content" && onContent && !curType && ty.api === "article");
                              return (
                                <Link key={ty.api} href={`/content?type=${ty.api}`} className={"nav-subi" + (tyActive ? " on" : "")}>
                                  <i className="nav-subi-dot" /><span>{lang === "th" ? ty.th : ty.en}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  });
                }
                return (
                  <Link key={n.id} href={"/" + n.id} className={active ? "on" : ""}>
                    <Icon name={n.icon} /><span>{t("nav." + n.id)}</span>
                    {n.id === "forms" && formsPending > 0
                      ? <span className="nav-badge">{formsPending}</span>
                      : <span className="kn">{n.k}</span>}
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
          <div className="demo-pill"><i /> {connected ? (lang === "th" ? "ออนไลน์" : "Online") : (lang === "th" ? "ออฟไลน์" : "Offline")}</div>
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
