"use client";
// Shared dark-mode toggle logic for ORST/RoyalSociety's own headers. Reads
// and writes the exact same `data-theme` attribute + `dga-theme` localStorage
// key that app/layout.tsx's THEME_BOOT script (and the gov-portal template's
// own ThemeToggle.tsx) already establish — deliberately reusing that one
// mechanism rather than inventing a second, so a preference set from either
// tenant's toggle survives a visit to any other tenant's pages too.
import { useEffect, useState } from "react";

export function useThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("dga-theme", next); } catch {}
    setDark(!dark);
  }

  return { dark, toggle };
}
