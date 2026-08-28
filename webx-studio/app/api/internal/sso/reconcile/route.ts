// SSO deprovisioning reconciliation trigger — same shape as
// /api/internal/releases/process-due: secret-protected (an external
// scheduler on an interval, not an admin session), not an in-process timer
// (multiple `webx` replicas would each tick independently otherwise).
import { NextRequest, NextResponse } from "next/server";
import { reconcileSsoDeprovisioning } from "@/lib/cms/governance";
import { WEBX_SCHEDULER_SECRET } from "@/lib/config";

export async function POST(req: NextRequest) {
  if (!WEBX_SCHEDULER_SECRET || req.headers.get("x-internal-secret") !== WEBX_SCHEDULER_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await reconcileSsoDeprovisioning();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "sso reconcile failed" }, { status: 500 });
  }
}
