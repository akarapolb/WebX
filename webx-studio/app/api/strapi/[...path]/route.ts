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
    // audit trail: every successful content mutation through the BFF is logged
    if (!["GET", "HEAD"].includes(req.method) && r.ok) logAudit(req.method, path, token).catch(() => {});
    return new NextResponse(body, {
      status: r.status,
      headers: { "Content-Type": r.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Upstream unreachable" }, { status: 502 });
  }
}

// fire-and-forget audit logging (actor + action + target). Skips system collections.
async function logAudit(method: string, path: string[], token: string) {
  const full = path.join("/");
  if (/audit-log|page-version|ab-event/.test(full)) return; // don't audit the plumbing
  let actor = "admin";
  try {
    const me = await fetch(`${STRAPI_URL}/admin/users/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (me.ok) { const j = await me.json(); const u = j.data ?? j; actor = u.email || `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || "admin"; }
  } catch {}
  const action = full.includes("/actions/publish") ? "publish" : full.includes("/actions/unpublish") ? "unpublish" : method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
  const m = full.match(/(?:collection-types|single-types)\/([^/?]+)(?:\/([^/?]+))?/);
  const contentType = m ? m[1] : full.split("/")[0] || "";
  const targetRef = m && m[2] && m[2] !== "actions" ? m[2] : "";
  try {
    await fetch(`${STRAPI_URL}/content-manager/collection-types/api::audit-log.audit-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ actor, action, contentType, targetRef, method, path: "/" + full }),
    });
  } catch {}
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(req: NextRequest, { params }: Ctx) { return handle(req, (await params).path); }
export async function POST(req: NextRequest, { params }: Ctx) { return handle(req, (await params).path); }
export async function PUT(req: NextRequest, { params }: Ctx) { return handle(req, (await params).path); }
export async function PATCH(req: NextRequest, { params }: Ctx) { return handle(req, (await params).path); }
export async function DELETE(req: NextRequest, { params }: Ctx) { return handle(req, (await params).path); }
