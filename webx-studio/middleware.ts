import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/config";

// Gate every app route on the presence of a session cookie. Token *validity* is
// re-checked server-side in the (app) layout via /admin/users/me.
export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protect everything except login, the auth API, api/internal (its own
  // secret-header auth — see app/api/internal/releases/process-due, called
  // by an external scheduler with no session cookie), and static assets.
  matcher: ["/((?!login|api/auth|api/internal|_next/static|_next/image|favicon.ico).*)"],
};
