import { Shell, siteMetadata, searchPath } from "@/templates/dgahub/Site";
import Search from "@/templates/dgahub/Search";

export async function generateMetadata() {
  const m = await siteMetadata("en", "search");
  return { ...m, title: "Search · " + String(m.openGraph?.siteName || ""), robots: { index: false } };
}

export default function Page() {
  return <Shell locale="en" path={searchPath("en")}><Search locale="en" /></Shell>;
}
