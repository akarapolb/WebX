// BFF proxy: client calls /api/strapi/<strapi-path> and we forward server-side,
// attaching the Bearer token from the httpOnly cookie. The browser never sees the token.
//
// This forwards with the CALLER'S OWN Strapi session token (unlike governed.*,
// which routes bookkeeping writes through a service credential) — so in
// principle a caller's own Strapi permissions are the only thing standing
// between them and whatever path they ask for. In practice that's not
// enough on its own: the Editor role (assigned to every self-serve/SSO
// login) has full CRUD on api::tenant.tenant, api::audit-log.audit-log,
// api::field-policy.field-policy and api::release.release directly in
// Strapi, none of which are in this app's own SCOPED set — so an
// unrestricted proxy would hand back, via the caller's own real
// permissions, the same cross-tenant write governance.ts's
// assertBookkeepingWriteAllowed() now closes on the /api/cms/* path. It
// also has no equivalent of governance.ts's custom-role view gate, so
// content-manager reads through here would ignore a view:false role.
//
// Rather than try to replicate governance.ts's per-uid logic a second time
// for an open-ended path, this allowlists the exact handful of Strapi
// routes the UI actually calls through this proxy (verified against every
// fetch("/api/strapi/...") call site) and 403s everything else — including
// admin/* and content-manager/* for any uid other than the one read-only
// exception below.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { STRAPI_URL } from "@/lib/config";

const ALLOWED_EXACT: Record<string, Set<string>> = {
  "api/analytics/summary": new Set(["GET"]),
  "api/analytics/report": new Set(["GET"]),
  "content-manager/collection-types/api::block-type.block-type": new Set(["GET"]),
  "content-manager/collection-types/api::icon.icon": new Set(["GET"]),
  "api/ai/answer": new Set(["GET"]),
  "api/search": new Set(["GET"]),
  "api/console/context": new Set(["GET"]),
  "api/console/branding": new Set(["GET", "PUT"]), // scopes to the caller's own tenant server-side (src/api/console/controllers/console.ts)
  "sitemap.xml": new Set(["GET"]),
  "robots.txt": new Set(["GET"]),
  "llms.txt": new Set(["GET"]),
  upload: new Set(["POST"]),
};
function isAllowed(path: string[], method: string): boolean {
  const joined = path.join("/");
  const exact = ALLOWED_EXACT[joined];
  if (exact?.has(method)) return true;
  // Uploaded media (VisualBuilder image display) — GET only, arbitrary filename.
  if (method === "GET" && path[0] === "uploads") return true;
  return false;
}

async function handle(req: NextRequest, path: string[]) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!isAllowed(path, req.method)) return NextResponse.json({ error: "Not allowed through this proxy" }, { status: 403 });

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
    // arrayBuffer (not text) so binary responses — uploaded images, files — pass
    // through intact; text() would UTF-8-decode and corrupt them. JSON is unaffected.
    const body = await r.arrayBuffer();
    // Audit logging is handled server-side by the Strapi document-service middleware
    // (src/index.ts), which captures every admin write incl. content-manager + super admin.
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
