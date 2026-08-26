import { NextRequest } from "next/server";
import { governed } from "@/lib/cms/governance";
import { handle, parseQuery } from "@/lib/cms/route-helpers";

type Ctx = { params: Promise<{ uid: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { uid } = await params;
  const query = parseQuery(req.nextUrl.searchParams);
  return handle(() => governed.list(uid, query));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { uid } = await params;
  const data = await req.json().catch(() => ({}));
  return handle(() => governed.create(uid, data));
}
