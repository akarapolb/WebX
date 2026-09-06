"use client";
// Replaces Header.tsx's own previously-inert ก-/ก/ก+/"ความคมชัด" buttons —
// see that file's comment and useAccessibilityToolbar.ts for the shared
// state/effects this wires up. Same className/markup as before so
// 03-layout.css's existing `.top-tool`/`.contrast-tool` styling is
// unaffected; only real onClick/aria-pressed behavior is new.
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
      <button className="top-tool" type="button" aria-label="ลดขนาดตัวอักษร" onClick={() => step(-1)}>ก-</button>
      <button className="top-tool" type="button" aria-label="ขนาดตัวอักษรปกติ" aria-pressed={fontSize === "normal"} onClick={() => step(0)}>ก</button>
      <button className="top-tool" type="button" aria-label="เพิ่มขนาดตัวอักษร" onClick={() => step(1)}>ก+</button>
      <button className="top-tool contrast-tool" type="button" aria-pressed={contrast} onClick={toggleContrast}>ความคมชัด</button>
    </>
  );
}
