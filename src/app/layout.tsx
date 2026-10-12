import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import "./globals.css";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.title, template: "%s | VeilCall" },
  description: siteConfig.description,
  applicationName: "VeilCall",
  icons: { icon: "/favicon.svg", type: "image/svg+xml" },
  alternates: { canonical: "/" },
  openGraph: { type: "website", title: siteConfig.title, description: siteConfig.description, siteName: "VeilCall", url: "/" },
  twitter: { card: "summary", title: siteConfig.title, description: siteConfig.description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f5f1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ClerkProvider appearance={{ theme: shadcn }}>{children}</ClerkProvider></body></html>;
}
