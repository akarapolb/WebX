// SSO deprovisioning reconciliation trigger — same shape as
// /api/internal/releases/process-due: secret-protected (an external
// scheduler on an interval, not an admin session), not an in-process timer
// (multiple `webx` replicas would each tick independently otherwise).
import { NextRequest, NextResponse } from "next/server";
import { reconcileSsoDeprovisioning } from "@/lib/cms/governance";
import { schedulerSecretRefusal } from "@/lib/internalAuth";

export async function POST(req: NextRequest) {
  const refused = schedulerSecretRefusal(req);
  if (refused) return refused;
  try {
    const result = await reconcileSsoDeprovisioning();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "sso reconcile failed" }, { status: 500 });
  }
}
