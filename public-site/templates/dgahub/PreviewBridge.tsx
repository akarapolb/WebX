"use client";
// dgahub template — draft preview for WebX Studio. Studio's Visual Builder
// (Preview button) loads /dgahub/preview or /en/dgahub/preview in an iframe and
// posts the page's unsaved blocks here; this renders them with the hub's real
// Blocks inside the real header/footer (the route's Shell) and stylesheet, so
// editors see the page exactly as it will publish. Same protocol as
// templates/_builder/PreviewBridge.tsx (ORST): webx:builder:render in,
// webx:harness:hello / webx:harness:height out, sender origin checked.
import { useEffect, useState } from "react";
import type { Dataset, Locale } from "@/lib/cms";
import Blocks from "./Blocks";

// Studio origins allowed to drive the preview. NEXT_PUBLIC_STUDIO_ORIGIN
// (comma-separated) in production; local Studio runs on :3200 (DGA setup) or :3000.
const ALLOWED = (process.env.NEXT_PUBLIC_STUDIO_ORIGIN || "http://localhost:3200,http://localhost:3000").split(",").map((s) => s.trim());

// edit: Studio's editing canvas (click a block to select it; links don't navigate).
// active: index of the block selected in Studio's sidebar (outlined here).
type Msg = { type: "webx:builder:render"; blocks: any[]; isHome?: boolean; edit?: boolean; active?: number };

/** The innermost element marked with block index `n` (a dashboard row of charts
 *  is marked as a whole and per chart), as the box to outline. */
function boxOf(n: number): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-wx-block="${n}"]`));
  const inner = all.find((el) => !el.querySelector(`[data-wx-block="${n}"]`));
  return (inner?.firstElementChild as HTMLElement) || null;
}

export default function PreviewBridge({ locale, tenant, home, datasets, articles, faqs }: {
  locale: Locale; tenant: string; home: string; datasets: Dataset[]; articles: any[]; faqs: any[];
}) {
  const [msg, setMsg] = useState<Msg | null>(null);
  const [parent, setParent] = useState<{ win: Window; origin: string } | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ALLOWED.includes(e.origin)) return;
      const data = e.data as Msg | undefined;
      if (data?.type !== "webx:builder:render") return;
      setMsg({ type: data.type, blocks: Array.isArray(data.blocks) ? data.blocks : [], isHome: !!data.isHome, edit: !!data.edit, active: typeof data.active === "number" ? data.active : -1 });
      if (e.source && "postMessage" in e.source) setParent({ win: e.source as Window, origin: e.origin });
    }
    window.addEventListener("message", onMessage);
    // Say hello until Studio answers: the iframe's load event can reset
    // Studio's "ready" flag after a first hello sent during hydration.
    let got = false, n = 0;
    const hello = () => { if (got || n++ > 20) return clearInterval(timer); ALLOWED.forEach((o) => { try { window.parent.postMessage({ type: "webx:harness:hello" }, o); } catch {} }); };
    const timer = setInterval(hello, 700);
    hello();
    const stop = (e: MessageEvent) => { if (ALLOWED.includes(e.origin) && e.data?.type === "webx:builder:render") got = true; };
    window.addEventListener("message", stop);
    return () => { window.removeEventListener("message", onMessage); window.removeEventListener("message", stop); clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!parent) return;
    const send = () => { try { parent.win.postMessage({ type: "webx:harness:height", px: document.documentElement.scrollHeight }, parent.origin); } catch {} };
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    send();
    return () => ro.disconnect();
  }, [parent]);

  // Editing canvas: a click selects the block under it (reported to Studio)
  // instead of following links or submitting forms.
  useEffect(() => {
    if (!msg?.edit || !parent) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const el = t?.closest<HTMLElement>("[data-wx-block]");
      if (t?.closest("a")) e.preventDefault(); // never navigate away from the canvas
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      { try { parent.win.postMessage({ type: "webx:harness:select", index: Number(el.dataset.wxBlock) }, parent.origin); } catch {} }
    };
    const block = (e: Event) => { e.preventDefault(); };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", block, true);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("submit", block, true); };
  }, [msg?.edit, parent]);

  // Outline the block selected in Studio.
  useEffect(() => {
    document.querySelectorAll(".wx-active").forEach((el) => el.classList.remove("wx-active"));
    if (!msg?.edit || msg.active == null || msg.active < 0) return;
    boxOf(msg.active)?.classList.add("wx-active");
  }, [msg]);

  if (!msg) {
    return (
      <section className="section"><div className="wrap">
        <p className="muted">{locale === "en" ? "Waiting for the page from WebX Studio…" : "กำลังรอหน้าจาก WebX Studio…"}</p>
      </div></section>
    );
  }
  return <>
    {msg.edit && <style>{`[data-wx-block] > *{cursor:pointer} main [data-wx-block] > *:hover{outline:2px dashed #6366f1;outline-offset:-2px} .wx-active{outline:3px solid #6366f1 !important;outline-offset:-3px}`}</style>}
    <Blocks mark={!!msg.edit} blocks={msg.blocks} isHome={!!msg.isHome} locale={locale} tenant={tenant} home={home} datasets={datasets} articles={articles} faqs={faqs} />
  </>;
}
