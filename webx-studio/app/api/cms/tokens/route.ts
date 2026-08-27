import { NextRequest } from "next/server";
import { listApiTokens, createApiToken } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET() {
  return handle(() => listApiTokens());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(() => createApiToken(body));
}
