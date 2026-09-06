"use client";
// Shared by both tenants' topbar accessibility controls (ก-/ก/ก+ and a
// contrast toggle). Both `royalsociety/css/05-accessibility.css` and, now,
// `orst/css/accessibility.css` already define the CSS this drives
// (`html[data-font-size="small"|"large"]`, `body.access-contrast`) — neither
// tenant's markup ever called it (RoyalSociety's own buttons were rendered
// intentionally inert; ORST had no controls at all — see each Header.tsx's
// own comment). This is the one small piece of client state both need,
// pulled out the same way MobileMenuToggle.tsx pulls the mobile drawer out
// of an otherwise-Server-Component Header.
import { useCallback, useEffect, useState } from "react";

export type FontSize = "small" | "normal" | "large";
const STORAGE_KEY = "webx-a11y";

type Stored = { fontSize: FontSize; contrast: boolean };

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { fontSize: "normal", contrast: false };
    const parsed = JSON.parse(raw);
    return {
      fontSize: parsed.fontSize === "small" || parsed.fontSize === "large" ? parsed.fontSize : "normal",
      contrast: !!parsed.contrast,
    };
  } catch {
    return { fontSize: "normal", contrast: false };
  }
}

export function useAccessibilityToolbar() {
  // Starts at the same default the server-rendered HTML has (no attribute/
  // class), then syncs to the citizen's saved preference on mount — avoids a
  // hydration mismatch, at the cost of one visible flash on repeat visits
  // with a saved non-default preference, same tradeoff every
  // localStorage-backed preference on a static export makes.
  const [fontSize, setFontSizeState] = useState<FontSize>("normal");
  const [contrast, setContrastState] = useState(false);

  useEffect(() => {
    const stored = readStored();
    setFontSizeState(stored.fontSize);
    setContrastState(stored.contrast);
  }, []);

  useEffect(() => {
    if (fontSize === "normal") document.documentElement.removeAttribute("data-font-size");
    else document.documentElement.setAttribute("data-font-size", fontSize);
  }, [fontSize]);

  useEffect(() => {
    document.body.classList.toggle("access-contrast", contrast);
  }, [contrast]);

  const persist = useCallback((next: Partial<Stored>) => {
    const merged = { fontSize, contrast, ...next };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
  }, [fontSize, contrast]);

  const setFontSize = useCallback((next: FontSize) => {
    setFontSizeState(next);
    persist({ fontSize: next });
  }, [persist]);

  const toggleContrast = useCallback(() => {
    setContrastState((prev) => {
      const next = !prev;
      persist({ contrast: next });
      return next;
    });
  }, [persist]);

  return { fontSize, setFontSize, contrast, toggleContrast };
}
