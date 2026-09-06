"use client";
// Dark-mode toggle for RoyalSociety's own header — see lib/useThemeToggle.ts
// for the shared read/write logic (same data-theme attribute + dga-theme
// localStorage key the gov-portal template's own toggle, and ORST's sister
// component, both already use). Split into its own client component for the
// same reason AccessibilityTools.tsx is: Header.tsx itself has no "use
// client" of its own.
import { useThemeToggle } from "@/lib/useThemeToggle";
import { RsIcon } from "./icons";

export default function ThemeToggle() {
  const { dark, toggle } = useThemeToggle();
  return (
    <button className="top-tool" type="button" aria-pressed={dark} aria-label="สลับโหมดมืด" onClick={toggle}>
      <RsIcon id={dark ? "i-sun" : "i-moon"} className="icon" />
    </button>
  );
}
