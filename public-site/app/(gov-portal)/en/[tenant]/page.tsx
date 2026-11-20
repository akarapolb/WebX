import HomePage, { homeMetadata } from "@/components/HomePage";
import { listTenants } from "@/lib/cms";

// English twin of app/(gov-portal)/[tenant]/page.tsx — same tenants, served at
// /en/<tenant>. ORST/RoyalSociety keep their own literal /en/orst and
// /en/royalsociety routes (a static segment wins over this dynamic one).
export async function generateStaticParams() {
  const tenants = await listTenants();
  return tenants
    .filter((t) => t.key !== "dga" && (t.publicTemplate || "gov-portal") === "gov-portal")
    .map((t) => ({ tenant: t.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  return homeMetadata((await params).tenant, "en");
}

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <HomePage tenantKey={tenant} locale="en" />;
}
