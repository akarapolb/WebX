import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CollectionPageRenderer from "@/components/CollectionPageRenderer";
import {
  listTenants, getTenant, getNavItems,
  listCollectionPageConfigs, listCollectionIdentifiers, getCollectionPageConfig, getCollectionEntry,
} from "@/lib/cms";

// The detail-page pair to Collection List — one route per tenant+content-
// type+entry, e.g. /dga/articles/<slug> or /dga/jobs/<documentId>. Mirrors
// [tenant]/[slug]/page.tsx's exact shape, one level deeper. The dynamic
// segment here is still named `slug` (not `collection`) — Next.js requires
// every dynamic segment at the same route-tree depth to share one param
// name, and the sibling [tenant]/[slug]/page.tsx already claims `slug` at
// this position; the value itself is a content type's `pluralName`, not a
// page slug, but the folder name is just plumbing. Route DEPTH (2 segments
// vs 3) is what actually disambiguates a real page (/dga/news) from a
// collection detail page (/dga/articles/<entry>) — no name collision.
export async function generateStaticParams() {
  const tenants = await listTenants();
  const govPortalTenants = tenants.filter((t) => (t.publicTemplate || "gov-portal") === "gov-portal");
  const params: { tenant: string; slug: string; entry: string }[] = [];
  for (const t of govPortalTenants) {
    const configs = await listCollectionPageConfigs(t.key);
    for (const c of configs) {
      const ids = await listCollectionIdentifiers(t.key, c.pluralName);
      for (const id of ids) params.push({ tenant: t.key, slug: c.pluralName, entry: id });
    }
  }
  return params;
}

// Static export delivers a non-ASCII path segment already percent-encoded
// (unlike normal dynamic SSR routes, which auto-decode `params`) — decode
// once here so a Thai article/blog slug round-trips correctly. A no-op for
// every other content type's plain-ASCII documentId identifier.
export async function generateMetadata({ params }: { params: Promise<{ tenant: string; slug: string; entry: string }> }): Promise<Metadata> {
  const { tenant, slug: pluralName, entry } = await params;
  const config = await getCollectionPageConfig(tenant, pluralName);
  if (!config) return {};
  const row = await getCollectionEntry(tenant, pluralName, decodeURIComponent(entry), config.imageField);
  if (!row) return {};
  return { title: config.titleField ? row[config.titleField] : undefined };
}

export default async function Page({ params }: { params: Promise<{ tenant: string; slug: string; entry: string }> }) {
  const { tenant: tenantKey, slug: pluralName, entry } = await params;
  const config = await getCollectionPageConfig(tenantKey, pluralName);
  if (!config) return notFound();
  const row = await getCollectionEntry(tenantKey, pluralName, decodeURIComponent(entry), config.imageField);
  if (!row) return notFound();
  const tenantData = await getTenant(tenantKey);
  const navItems = await getNavItems(tenantKey);
  const tenant = tenantData || { key: tenantKey, name: tenantKey };
  return <CollectionPageRenderer tenant={tenant} tenantKey={tenantKey} navItems={navItems} entry={row} config={config} />;
}
