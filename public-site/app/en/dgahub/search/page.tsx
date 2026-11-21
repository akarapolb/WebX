import { Shell, site, searchPath } from "@/templates/dgahub/Site";
import Search from "@/templates/dgahub/Search";
import { searchMetadata } from "@/lib/site/metadata";

export function generateMetadata() {
  return searchMetadata(site, "en");
}

export default function Page() {
  return <Shell locale="en" path={searchPath("en")}><Search locale="en" /></Shell>;
}
