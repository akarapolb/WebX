import Site, { siteMetadata } from "@/templates/dgahub/Site";

export function generateMetadata() {
  return siteMetadata("th");
}

export default function Page() {
  return <Site locale="th" />;
}
