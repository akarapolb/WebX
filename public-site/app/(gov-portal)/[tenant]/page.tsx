import HomePage from "@/components/HomePage";
import { listTenants } from "@/lib/cms";

// One static page per gov-portal-template tenant, generated at build time —
// this is what replaces the old client-side tenant-detect-then-rebrand-
// after-load hack: the right tenant's HTML is served directly, nothing
// re-brands after paint. ORST/RoyalSociety tenants (Phase 8) have their own
// distinct template and their own literal routes (app/orst, app/royalsociety)
// instead of going through this dynamic segment.
// dga used to be filtered out here because its homepage is served at "/"
// (see the sibling root page.tsx) — but the route still ACCEPTED /dga, and a
// path with no generateStaticParams entry is an error under `output: export`
// (observed live: /dga answered 500 while every other tenant answered 200).
// Emitting it too makes the "/{tenant}" shape hold for every tenant without
// exception. It does mean dga's homepage is reachable at both "/" and
// "/dga"; if that duplication ever matters for SEO, the fix is a canonical
// link on this route, not dropping the param again.
export async function generateStaticParams() {
  const tenants = await listTenants();
  return tenants
    .filter((t) => (t.publicTemplate || "gov-portal") === "gov-portal")
    .map((t) => ({ tenant: t.key }));
}

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <HomePage tenantKey={tenant} />;
}
