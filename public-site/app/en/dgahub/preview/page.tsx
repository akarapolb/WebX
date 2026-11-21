import { Preview } from "@/templates/dgahub/Site";

// WebX Studio's draft preview of a hub page (en), see templates/dgahub/PreviewBridge.tsx.
export const metadata = { title: "Preview", robots: { index: false, follow: false } };

export default function Page() {
  return <Preview locale="en" />;
}
