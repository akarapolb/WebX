"use client";
// RoyalSociety's half of the Visual Builder's preview harness protocol — see
// templates/_builder/PreviewBridge.tsx (ORST's sibling) for the rationale and
// HarnessBridge.tsx for the protocol itself; this only swaps in
// RoyalSociety's own Blocks registry.
import Blocks from "@/templates/royalsociety/Blocks";
import HarnessBridge from "./HarnessBridge";

export type { PreviewMessage } from "./HarnessBridge";

export default function PreviewBridgeRoyalSociety() {
  return <HarnessBridge Blocks={Blocks} />;
}
