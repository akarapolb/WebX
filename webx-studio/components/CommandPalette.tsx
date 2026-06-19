"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { NAV } from "@/lib/nav";
import { useLang } from "./LangProvider";

type Cmd = { id: string; group: "nav" | "act"; label: string; hint?: string; icon: string; run: () => void };

export default function CommandPalette({
  open, onClose, onToggleTheme, onLogout,
}: {
  open: boolean; onClose: () => void; onToggleTheme: () => void; onLogout: () => void;
}) {
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const all: Cmd[] = useMemo(() => {
    const nav: Cmd[] = NAV.map((n) => ({
      id: "nav-" + n.id, group: "nav", icon: n.icon, hint: "#" + n.k,
      label: t("cmdk.goto") + " " + t("nav." + n.id),
      run: () => router.push("/" + n.id),
    }));
    const acts: Cmd[] = [
      { id: "act-theme", group: "act", icon: "palette", label: t("cmdk.theme"), run: onToggleTheme },
      { id: "act-lang", group: "act", icon: "spark", label: t("cmdk.lang"), run: () => setLang(lang === "en" ? "th" : "en") },
      { id: "act-logout", group: "act", icon: "logout", label: t("cmdk.logout"), run: onLogout },
    ];
    return [...nav, ...acts];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, lang]);

  const filtered = useMemo(
    () => all.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())),
    [all, q]
  );

  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 40); } }, [open]);
  useEffect(() => { if (sel >= filtered.length) setSel(0); }, [filtered.length, sel]);

  if (!open) return null;

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); fire(sel); }
    else if (e.key === "Escape") { onClose(); }
  }
  function fire(i: number) { const c = filtered[i]; if (c) { c.run(); onClose(); } }

  const navItems = filtered.filter((c) => c.group === "nav");
  const actItems = filtered.filter((c) => c.group === "act");

  return (
    <>
      <div className="scrim" onClick={onClose} style={{ zIndex: 79 }} />
      <div className="cmdk">
        <div className="cmdk-in">
          <Icon name="search" />
          <input ref={inputRef} value={q} placeholder={t("cmdk.ph")} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
          <span className="esc">ESC</span>
        </div>
        <div className="cmdk-list">
          {navItems.length > 0 && <div className="cmdk-g">{t("cmdk.nav")}</div>}
          {navItems.map((c) => {
            const gi = filtered.indexOf(c);
            return (
              <div key={c.id} className={"cmdk-it" + (gi === sel ? " sel" : "")} onClick={() => fire(gi)} onMouseEnter={() => setSel(gi)}>
                <Icon name={c.icon} /><span className="ci-l">{c.label}</span>{c.hint && <span className="ci-h">{c.hint}</span>}
              </div>
            );
          })}
          {actItems.length > 0 && <div className="cmdk-g">{t("cmdk.actions")}</div>}
          {actItems.map((c) => {
            const gi = filtered.indexOf(c);
            return (
              <div key={c.id} className={"cmdk-it" + (gi === sel ? " sel" : "")} onClick={() => fire(gi)} onMouseEnter={() => setSel(gi)}>
                <Icon name={c.icon} /><span className="ci-l">{c.label}</span>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="cmdk-g">—</div>}
        </div>
      </div>
    </>
  );
}
