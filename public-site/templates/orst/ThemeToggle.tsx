"use client";
// Dark-mode toggle for ORST's own header — see lib/useThemeToggle.ts for the
// shared read/write logic (same data-theme attribute + dga-theme
// localStorage key the gov-portal template's own toggle already uses).
// Split into its own client component for the same reason
// AccessibilityTools.tsx is: Header.tsx itself has no "use client" of its
// own. Bare markup, same as AccessibilityTools — components.css styles
// `.topbar-group button` generically, no className needed here either.
import { useThemeToggle } from "@/lib/useThemeToggle";

export default function ThemeToggle() {
  const { dark, toggle } = useThemeToggle();
  return (
    <button type="button" aria-pressed={dark} aria-label="สลับโหมดมืด" onClick={toggle}>
      <svg className="icon" aria-hidden="true">
        <use href={`#${dark ? "i-sun" : "i-moon"}`} />
      </svg>
    </button>
  );
}
