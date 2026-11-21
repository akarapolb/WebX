import { Preview } from "@/templates/dgahub/Site";

// WebX Studio's draft preview of a hub page (th), see templates/dgahub/PreviewBridge.tsx.
export const metadata = { title: "Preview", robots: { index: false, follow: false } };

export default function Page() {
  return <Preview locale="th" />;
}
