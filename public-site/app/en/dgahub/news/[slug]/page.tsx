import { Shell } from "@/templates/dgahub/Site";
import { NewsItem, newsMetadata, newsPath, newsSlugs } from "@/templates/dgahub/News";

export const dynamicParams = false;

export async function generateStaticParams() {
  const s = await newsSlugs("en");
  return s.length ? s : [{ slug: "_" }];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return newsMetadata("en", (await params).slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Shell locale="en" path={newsPath("en", slug)}><NewsItem locale="en" slug={slug} /></Shell>;
}
