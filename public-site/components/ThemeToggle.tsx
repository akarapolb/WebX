"use client";
import { useEffect, useState } from "react";
import { Icon } from "./IconSprite";

export default function ThemeToggle() {
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

  return (
    <button className="btn btn--ghost btn--icon" aria-pressed={dark} aria-label="สลับโหมดมืด" onClick={toggle}>
      <Icon id={dark ? "i-sun" : "i-moon"} />
    </button>
  );
}
