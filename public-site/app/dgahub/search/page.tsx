import { Shell, site, searchPath } from "@/templates/dgahub/Site";
import Search from "@/templates/dgahub/Search";
import { searchMetadata } from "@/lib/site/metadata";

export function generateMetadata() {
  return searchMetadata(site, "th");
}

export default function Page() {
  return <Shell locale="th" path={searchPath("th")}><Search locale="th" /></Shell>;
}
