import type { Viewport } from "next";
import DgahubHead from "@/templates/dgahub/Head";

export const viewport: Viewport = { themeColor: "#12161f" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><DgahubHead />{children}</>;
}
