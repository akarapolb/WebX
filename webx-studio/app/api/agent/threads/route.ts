import { NextRequest } from "next/server";
import { listAgentThreads, createAgentThread } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET() {
  return handle(() => listAgentThreads());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(() => createAgentThread({ tenantKey: body.tenantKey ?? null, title: body.title || "New chat", context: body.context || {} }));
}
