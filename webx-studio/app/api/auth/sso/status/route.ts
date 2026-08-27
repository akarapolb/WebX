import { NextRequest, NextResponse } from "next/server";
import { ssoLoginAvailable } from "@/lib/cms/governance";

export async function GET(req: NextRequest) {
  const tenantKey = req.nextUrl.searchParams.get("tenant") || "";
  if (!tenantKey) return NextResponse.json({ enabled: false });
  return NextResponse.json(await ssoLoginAvailable(tenantKey).catch(() => ({ enabled: false })));
}
