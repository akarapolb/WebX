"use client";
// Small interactive pieces Blocks.tsx needs that plain server-rendered JSX
// can't provide — same split-out-a-client-file convention as ORST's
// HomeInteractive.tsx (ScrollButton). Currently just the recommended-
// carousel's prev/next buttons; the source's own equivalent buttons
// (data-rec-prev/data-rec-next) were unwired dead markup before this file
// existed (the original static site's JS bundle drove them, never ported),
// so this is new working behavior, not a port.
export function RsScrollButton({ rowId, dir, label }: { rowId: string; dir: "left" | "right"; label: string }) {
  return (
    <button
      className="rec-nav"
      type="button"
      aria-label={label}
      onClick={() => document.getElementById(rowId)?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" })}
    >
      {dir === "left" ? "‹" : "›"}
    </button>
  );
}
