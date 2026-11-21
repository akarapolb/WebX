import { Shell, siteMetadata, searchPath } from "@/templates/dgahub/Site";
import Search from "@/templates/dgahub/Search";

export async function generateMetadata() {
  const m = await siteMetadata("th", "search");
  return { ...m, title: "ค้นหา · " + String(m.openGraph?.siteName || ""), robots: { index: false } };
}

export default function Page() {
  return <Shell locale="th" path={searchPath("th")}><Search locale="th" /></Shell>;
}
