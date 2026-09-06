"use client";
// RoyalSociety's half of the Visual Builder's preview harness protocol — see
// templates/_builder/PreviewBridge.tsx (ORST's sibling) for the full
// protocol writeup and rationale; this is a straight copy with the import
// swapped, exactly as that file's own comment anticipated.
import { useEffect, useState } from "react";
import Blocks from "@/templates/royalsociety/Blocks";

const ALLOWED_PARENT_ORIGINS = (process.env.NEXT_PUBLIC_STUDIO_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim());

export type PreviewMessage = { type: "webx:builder:render"; blocks: any[] };

export default function PreviewBridgeRoyalSociety() {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [parent, setParent] = useState<{ win: Window; origin: string } | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ALLOWED_PARENT_ORIGINS.includes(e.origin)) return;
      const data = e.data as PreviewMessage | undefined;
      if (data?.type !== "webx:builder:render") return;
      setBlocks(Array.isArray(data.blocks) ? data.blocks : []);
      if (e.source && "postMessage" in e.source) setParent({ win: e.source as Window, origin: e.origin });
    }
    window.addEventListener("message", onMessage);
    ALLOWED_PARENT_ORIGINS.forEach((o) => { try { window.parent.postMessage({ type: "webx:harness:hello" }, o); } catch {} });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!parent) return;
    const ro = new ResizeObserver(() => {
      try { parent.win.postMessage({ type: "webx:harness:height", px: document.documentElement.scrollHeight }, parent.origin); } catch {}
    });
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [parent]);

  return <Blocks blocks={blocks} />;
}
