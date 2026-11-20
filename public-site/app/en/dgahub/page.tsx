import Site, { siteMetadata } from "@/templates/dgahub/Site";

export function generateMetadata() {
  return siteMetadata("en");
}

export default function Page() {
  return <Site locale="en" />;
}
