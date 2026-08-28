import { NextRequest } from "next/server";
import { listGovernableContentTypes } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  return handle(() => listGovernableContentTypes(tenant));
}
