"use client";
// ORST's half of the Visual Builder's preview harness — see
// webx-studio/components/blockPreview/RealPreview.tsx for the sending half
// and HarnessBridge.tsx (shared with RoyalSociety) for the protocol itself.
// Lives at a per-template route (app/orst/preview/page.tsx) so it inherits
// that template's OWN CSS chain and icon sprite from its layout, in the
// exact order production uses — the whole point of hosting the real renderer
// instead of porting it into webx-studio (zero duplicated CSS/markup, and the
// ORST/gov-portal icon-sprite id collision — e.g. "i-shield" means different
// artwork in each — simply cannot happen here, because only ORST's sprite is
// ever mounted in this document).
//
// Still no inline text editing: that needs cross-document scripting a
// genuinely cross-origin iframe (loaded by `src=`, not `srcDoc=`) cannot do.
// Selection is bridged, though — clicking a block here selects it in the
// Builder's sidebar, and the sidebar's selection is highlighted here.
//
// Renders ORST's own Blocks registry directly (rather than the page passing
// it in) because a Server Component page can't pass a function/component to
// a Client Component — neither is serializable across that boundary.
import Blocks from "@/templates/orst/Blocks";
import HarnessBridge from "./HarnessBridge";

export type { PreviewMessage } from "./HarnessBridge";

export default function PreviewBridge() {
  return <HarnessBridge Blocks={Blocks} />;
}
