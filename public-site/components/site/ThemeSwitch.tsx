"use client";
// WebX site kit — dark-mode switch (pairs with lib/site/theme.ts). Renders
// nothing until mounted, so the server HTML never shows the wrong state.
import { useEffect, useState } from "react";

export default function ThemeSwitch({ storageKey, locale, className = "wx-theme-btn", size = 14 }: {
  storageKey: string; locale: "th" | "en"; className?: string; size?: number;
}) {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);
  if (dark === null) return null;
  const label = locale === "en" ? "Dark mode" : "โหมดมืด";
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try { localStorage.setItem(storageKey, next ? "dark" : "light"); } catch {}
  };
  return (
    <button type="button" className={className} aria-pressed={dark} onClick={toggle} aria-label={label} title={label}>
      {dark
        ? <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        : <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" /></svg>}
    </button>
  );
}
