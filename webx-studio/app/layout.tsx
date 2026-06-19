import type { Metadata } from "next";
import "./globals.css";
import { LangProvider } from "@/components/LangProvider";

export const metadata: Metadata = {
  title: "WebX Studio",
  description: "Multi-tenant headless CMS backoffice — runs on a Strapi backend.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Kanit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body><LangProvider>{children}</LangProvider></body>
    </html>
  );
}
