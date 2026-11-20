import Site, { siteMetadata, slugs } from "@/templates/dgahub/Site";

export function generateStaticParams() {
  return slugs("en");
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return siteMetadata("en", (await params).slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <Site locale="en" slug={(await params).slug} />;
}
