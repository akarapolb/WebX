import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageRenderer from "@/components/PageRenderer";
import { listTenants, listPageSlugs, getTenant, getPage, getHomeData, getNavItems } from "@/lib/cms";

// Every OTHER page besides a tenant's homepage — see [tenant]/page.tsx for
// that one (dga's own lives at the root "/" instead, app/(gov-portal)/page.tsx).
// The one slug that already renders at the homepage route is excluded here
// so it doesn't also get a redundant duplicate at /[tenant]/home-blocks.
const HOMEPAGE_SLUG = "home-blocks";

export async function generateStaticParams() {
  const tenants = await listTenants();
  const govPortalTenants = tenants.filter((t) => (t.publicTemplate || "gov-portal") === "gov-portal");
  const params: { tenant: string; slug: string }[] = [];
  for (const t of govPortalTenants) {
    const slugs = await listPageSlugs(t.key);
    for (const slug of slugs) {
      if (slug !== HOMEPAGE_SLUG) params.push({ tenant: t.key, slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string; slug: string }> }): Promise<Metadata> {
  const { tenant, slug } = await params;
  const page = await getPage(tenant, slug);
  if (!page) return {};
  return { title: page.title, description: page.seoDescription || undefined };
}

export default async function Page({ params }: { params: Promise<{ tenant: string; slug: string }> }) {
  const { tenant: tenantKey, slug } = await params;
  const tenantData = await getTenant(tenantKey);
  const page = tenantData?.engine !== "wordpress" ? await getPage(tenantKey, slug) : null;
  if (!page?.blocks?.length) return notFound();
  const data = await getHomeData(tenantKey, tenantData?.engine);
  const navItems = await getNavItems(tenantKey);
  const tenant = tenantData || { key: tenantKey, name: tenantKey };
  return <PageRenderer tenant={tenant} tenantKey={tenantKey} blocks={page.blocks} homeData={data} navItems={navItems} />;
}
