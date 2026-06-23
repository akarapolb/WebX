import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, REFRESH_COOKIE } from "@/lib/config";

export async function POST() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(REFRESH_COOKIE);
  return NextResponse.json({ ok: true });
}
