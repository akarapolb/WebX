"use client";
import { useEffect, useState } from "react";
import { Icon } from "./IconSprite";
import { pathLocale } from "@/lib/i18n";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [en, setEn] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
    setEn(pathLocale() === "en");
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("dga-theme", next); } catch {}
    setDark(!dark);
  }

  return (
    <button className="btn btn--ghost btn--icon" aria-pressed={dark} aria-label={en ? "Dark mode" : "สลับโหมดมืด"} onClick={toggle}>
      <Icon id={dark ? "i-sun" : "i-moon"} />
    </button>
  );
}
