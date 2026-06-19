// BFF proxy: client calls /api/strapi/<strapi-path> and we forward server-side,
// attaching the Bearer token from the httpOnly cookie. The browser never sees the token.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { STRAPI_URL } from "@/lib/config";

async function handle(req: NextRequest, path: string[]) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const target = `${STRAPI_URL}/${path.join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct; // preserve multipart boundary for file uploads
  const init: RequestInit = { method: req.method, headers, cache: "no-store" };
  if (!["GET", "HEAD"].includes(req.method)) {
    // arrayBuffer preserves binary (file uploads); text() would corrupt it.
    const buf = await req.arrayBuffer();
    if (buf.byteLength) init.body = buf;
  }

  try {
    const r = await fetch(target, init);
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { "Content-Type": r.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Upstream unreachable" }, { status: 502 });
  }
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(req: NextRequest, { params }: Ctx) { return handle(req, (await params).path); }
export async function POST(req: NextRequest, { params }: Ctx) { return handle(req, (await params).path); }
export async function PUT(req: NextRequest, { params }: Ctx) { return handle(req, (await params).path); }
export async function PATCH(req: NextRequest, { params }: Ctx) { return handle(req, (await params).path); }
export async function DELETE(req: NextRequest, { params }: Ctx) { return handle(req, (await params).path); }
