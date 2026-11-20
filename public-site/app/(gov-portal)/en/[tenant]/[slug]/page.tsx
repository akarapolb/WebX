import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageRenderer from "@/components/PageRenderer";
import { listTenants, listPageSlugs, getTenant, getPage, getHomeData, getNavItems } from "@/lib/cms";
import { pageHref } from "@/lib/i18n";

// English twin of app/(gov-portal)/[tenant]/[slug]/page.tsx. A page appears
// here once it has an English localization in Strapi with the same slug.
const HOMEPAGE_SLUG = "home-blocks";

export async function generateStaticParams() {
  const tenants = await listTenants();
  const params: { tenant: string; slug: string }[] = [];
  for (const t of tenants.filter((t) => (t.publicTemplate || "gov-portal") === "gov-portal")) {
    for (const slug of await listPageSlugs(t.key, "en")) if (slug !== HOMEPAGE_SLUG) params.push({ tenant: t.key, slug });
  }
  // output:"export" rejects an empty list (it reads as "no generateStaticParams"),
  // which happens whenever no gov-portal tenant has English sub-pages yet. One
  // placeholder path that renders notFound() keeps the build valid.
  return params.length ? params : [{ tenant: "_", slug: "_" }];
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string; slug: string }> }): Promise<Metadata> {
  const { tenant, slug } = await params;
  const page = await getPage(tenant, slug, "en");
  if (!page) return {};
  return {
    title: page.title,
    description: page.seoDescription || undefined,
    alternates: { canonical: pageHref(tenant, "en", slug), languages: { th: pageHref(tenant, "th", slug), en: pageHref(tenant, "en", slug) } },
  };
}

export default async function Page({ params }: { params: Promise<{ tenant: string; slug: string }> }) {
  const { tenant: tenantKey, slug } = await params;
  const tenantData = await getTenant(tenantKey);
  const page = tenantData?.engine !== "wordpress" ? await getPage(tenantKey, slug, "en") : null;
  if (!page?.blocks?.length) return notFound();
  const data = await getHomeData(tenantKey, tenantData?.engine, "en");
  const navItems = await getNavItems(tenantKey, "en");
  const tenant = tenantData || { key: tenantKey, name: tenantKey };
  return <PageRenderer tenant={tenant} tenantKey={tenantKey} blocks={page.blocks} homeData={data} navItems={navItems} locale="en" path={pageHref(tenantKey, "en", slug)} />;
}
