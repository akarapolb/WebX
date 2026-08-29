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
    // A CmsError is an EXPECTED failure (a real permission/validation/not-
    // found condition, already given a clean message above) — this branch
    // is everything else: a genuine bug, a network error talking to Strapi/
    // WordPress, an unhandled exception. That used to vanish completely —
    // no console output, no Sentry/OTel/any logging dependency anywhere in
    // this app — leaving "Unexpected error" as the only trace, both to the
    // caller AND to whoever operates this in production. Logging it here
    // doesn't build real observability (see DEPLOY.md/status page's own
    // gaps), but it's the difference between a production 500 leaving zero
    // evidence anywhere and it at least showing up in the server's own log.
    console.error("[cms] unhandled error:", e);
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
