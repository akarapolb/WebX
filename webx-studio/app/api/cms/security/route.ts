import { getSecuritySettings, saveMfaRequirement } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";
import { NextRequest } from "next/server";

// Settings-page read/write for the caller's own workspace (no ?tenant= —
// unlike /api/cms/sso, this never needs to target a different tenant than
// the caller's own effective one).
export async function GET() {
  return handle(() => getSecuritySettings());
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(() => saveMfaRequirement(Boolean(body.mfaRequired)));
}
