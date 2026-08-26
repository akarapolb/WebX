import HomePage from "@/components/HomePage";
import { listTenants } from "@/lib/cms";

// One static page per gov-portal-template tenant, generated at build time —
// this is what replaces the old client-side tenant-detect-then-rebrand-
// after-load hack: the right tenant's HTML is served directly, nothing
// re-brands after paint. ORST/RoyalSociety tenants (Phase 8) have their own
// distinct template and their own literal routes (app/orst, app/royalsociety)
// instead of going through this dynamic segment.
export async function generateStaticParams() {
  const tenants = await listTenants();
  return tenants
    .filter((t) => t.key !== "dga" && (t.publicTemplate || "gov-portal") === "gov-portal")
    .map((t) => ({ tenant: t.key }));
}

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <HomePage tenantKey={tenant} />;
}
