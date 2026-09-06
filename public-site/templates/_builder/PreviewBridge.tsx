"use client";
// The receiving half of the Visual Builder's preview harness protocol —
// see webx-studio/components/blockPreview/RealPreview.tsx for the sending
// half. Lives at a per-template route (app/orst/preview/page.tsx) so it
// inherits that template's OWN CSS chain and icon sprite from its layout,
// in the exact order production uses — the whole point of hosting the real
// renderer instead of porting it into webx-studio (see the plan's rationale:
// zero duplicated CSS/markup, and the ORST/gov-portal icon-sprite id
// collision — e.g. "i-shield" means different artwork in each — simply
// cannot happen here, because only ORST's sprite is ever mounted in this
// document).
//
// Read-only: this only upgrades the Builder's PREVIEW fidelity. Inline
// click-to-edit (like gov-portal's RealPreview gets via createPortal into a
// same-origin srcDoc iframe) needs actual cross-document scripting, which a
// genuinely cross-origin iframe (this route, loaded by `src=`, not
// `srcDoc=`) cannot do — extending the postMessage protocol for that is a
// later phase. Sidebar-form editing (already built) is unaffected either way.
import { useEffect, useState } from "react";
import Blocks from "@/templates/orst/Blocks";

// Same-origin in dev (both on localhost); in production this must be the
// real webx-studio origin(s). Comma-separated so a staging + prod studio
// domain can both be allowed. NEXT_PUBLIC_ vars are baked in at build time,
// same as every other public-site env var (see lib/cms.ts's own).
const ALLOWED_PARENT_ORIGINS = (process.env.NEXT_PUBLIC_STUDIO_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim());

export type PreviewMessage = { type: "webx:builder:render"; blocks: any[] };

// Renders ORST's own Blocks registry directly (rather than accepting a
// `render` prop from the page) because a Server Component page can't pass a
// function to a Client Component — functions aren't serializable across
// that boundary. This component is already ORST-specific (imports ORST's
// own Blocks registry), so there's nothing generic lost by inlining it;
// RoyalSociety's own preview route gets its own PreviewBridge variant when
// it has a Blocks.tsx of its own to render.
export default function PreviewBridge() {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [parent, setParent] = useState<{ win: Window; origin: string } | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ALLOWED_PARENT_ORIGINS.includes(e.origin)) return; // hard origin gate — never trust an unlisted sender
      const data = e.data as PreviewMessage | undefined;
      if (data?.type !== "webx:builder:render") return;
      setBlocks(Array.isArray(data.blocks) ? data.blocks : []);
      if (e.source && "postMessage" in e.source) setParent({ win: e.source as Window, origin: e.origin });
    }
    window.addEventListener("message", onMessage);
    // Announce readiness so the Builder knows it can start sending — the
    // Builder's own listener ignores this if it arrives before it's mounted
    // (nothing to receive it yet), so the Builder resends on its own timer
    // rather than this being the only trigger.
    ALLOWED_PARENT_ORIGINS.forEach((o) => { try { window.parent.postMessage({ type: "webx:harness:hello" }, o); } catch {} });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!parent) return;
    // Auto-size the iframe from the PARENT side (the Builder sets the
    // iframe's height from this) — a cross-origin iframe can't be measured
    // by its parent directly (contentDocument access throws), so the child
    // has to report its own height instead.
    const ro = new ResizeObserver(() => {
      try { parent.win.postMessage({ type: "webx:harness:height", px: document.documentElement.scrollHeight }, parent.origin); } catch {}
    });
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [parent]);

  return <Blocks blocks={blocks} />;
}
