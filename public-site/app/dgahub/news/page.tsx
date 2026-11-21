import { Shell } from "@/templates/dgahub/Site";
import { NewsIndex, newsMetadata, newsPath } from "@/templates/dgahub/News";

export function generateMetadata() {
  return newsMetadata("th");
}

export default function Page() {
  return <Shell locale="th" path={newsPath("th")}><NewsIndex locale="th" /></Shell>;
}
