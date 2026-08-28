import { NextRequest } from "next/server";
import { contentUsageFor } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  return handle(() => contentUsageFor(tenant));
}
