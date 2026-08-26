// Shared response wrapper for the /api/cms/* route handlers — runs a
// governance.ts call and translates CmsError into the right HTTP status.
import "server-only";
import { NextResponse } from "next/server";
import { CmsError } from "./types";

export async function handle(fn: () => Promise<any>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data === undefined ? { ok: true } : data);
  } catch (e: any) {
    if (e instanceof CmsError) return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export function parseQuery(search: URLSearchParams) {
  const page = search.get("page");
  const pageSize = search.get("pageSize");
  const filterRaw = search.get("filter");
  let filter: { field: string; op: "eq" | "ne" | "contains"; value: any }[] | undefined;
  if (filterRaw) { try { filter = JSON.parse(filterRaw); } catch { filter = undefined; } }
  return {
    page: page != null ? Number(page) : undefined,
    pageSize: pageSize != null ? Number(pageSize) : undefined,
    sort: search.get("sort") || undefined,
    status: (search.get("status") as "draft" | "published" | "") || undefined,
    q: search.get("q") || undefined,
    filter,
  };
}

export function parseLocale(search: URLSearchParams): { locale?: string } | undefined {
  const locale = search.get("locale");
  return locale ? { locale } : undefined;
}
