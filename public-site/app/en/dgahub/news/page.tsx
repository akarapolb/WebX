import { Shell } from "@/templates/dgahub/Site";
import { NewsIndex, newsMetadata, newsPath } from "@/templates/dgahub/News";

export function generateMetadata() {
  return newsMetadata("en");
}

export default function Page() {
  return <Shell locale="en" path={newsPath("en")}><NewsIndex locale="en" /></Shell>;
}
