import { NextRequest } from "next/server";
import { complianceSecuritySignal, publicSiteStatus } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  return handle(async () => {
    const [sec, rel] = await Promise.all([complianceSecuritySignal(tenant), publicSiteStatus()]);
    return { sec, rel };
  });
}
