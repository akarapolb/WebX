import { NextRequest } from "next/server";
import { governed } from "@/lib/cms/governance";
import { handle, parseLocale } from "@/lib/cms/route-helpers";

type Ctx = { params: Promise<{ uid: string; id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { uid, id } = await params;
  const opts = parseLocale(req.nextUrl.searchParams);
  return handle(() => governed.unpublish(uid, id, opts));
}
