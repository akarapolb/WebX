import Site, { siteMetadata, slugs } from "@/templates/dgahub/Site";

export function generateStaticParams() {
  return slugs("th");
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return siteMetadata("th", (await params).slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <Site locale="th" slug={(await params).slug} />;
}
