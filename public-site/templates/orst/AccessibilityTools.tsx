"use client";
// Replaces Header.tsx's own previously-inert ก-/ก/ก+/"ความคมชัด" buttons —
// see that file's comment and useAccessibilityToolbar.ts for the shared
// state/effects this wires up (same hook RoyalSociety's own
// AccessibilityTools.tsx uses). Same bare markup as before (no className
// existed to preserve — components.css styles `.topbar-group button`
// generically) so this stays a drop-in replacement.
import { useAccessibilityToolbar, type FontSize } from "@/lib/useAccessibilityToolbar";

export default function AccessibilityTools() {
  const { fontSize, setFontSize, contrast, toggleContrast } = useAccessibilityToolbar();

  const step = (dir: -1 | 0 | 1) => {
    const order: FontSize[] = ["small", "normal", "large"];
    if (dir === 0) return setFontSize("normal");
    const next = order[Math.max(0, Math.min(2, order.indexOf(fontSize) + dir))];
    setFontSize(next);
  };

  return (
    <>
      <button type="button" aria-label="ลดขนาดตัวอักษร" onClick={() => step(-1)}>ก-</button>
      <button type="button" aria-label="ขนาดตัวอักษรปกติ" aria-pressed={fontSize === "normal"} onClick={() => step(0)}>ก</button>
      <button type="button" aria-label="เพิ่มขนาดตัวอักษร" onClick={() => step(1)}>ก+</button>
      <button type="button" aria-pressed={contrast} onClick={toggleContrast}>ความคมชัด</button>
    </>
  );
}
