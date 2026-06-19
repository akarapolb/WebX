import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { strapiLogin } from "@/lib/strapi";
import { SESSION_COOKIE, SESSION_TTL } from "@/lib/config";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }
  const res = await strapiLogin(email, password);
  if (!res.ok) {
    if ("network" in res) {
      return NextResponse.json(
        { error: "Cannot reach the Strapi backend. Make sure it is running." },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  // Token is stored httpOnly — it never reaches client JavaScript (BFF security model).
  const jar = await cookies();
  jar.set(SESSION_COOKIE, res.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
  return NextResponse.json({ ok: true, user: { email: res.user?.email } });
}
