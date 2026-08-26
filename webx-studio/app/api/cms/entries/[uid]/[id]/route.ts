import { NextRequest } from "next/server";
import { governed } from "@/lib/cms/governance";
import { handle, parseLocale } from "@/lib/cms/route-helpers";

type Ctx = { params: Promise<{ uid: string; id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { uid, id } = await params;
  const opts = parseLocale(req.nextUrl.searchParams);
  return handle(() => governed.get(uid, id, opts));
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { uid, id } = await params;
  const opts = parseLocale(req.nextUrl.searchParams);
  const data = await req.json().catch(() => ({}));
  return handle(() => governed.update(uid, id, data, opts));
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { uid, id } = await params;
  const opts = parseLocale(req.nextUrl.searchParams);
  return handle(() => governed.remove(uid, id, opts));
}
