import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://behalfid.com"),
  title: "BehalfID - Permission passports for AI agents",
  description: "Connect agents, define permissions, and verify actions before they happen.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "BehalfID - Permission passports for AI agents",
    description: "Connect agents, define permissions, and verify actions before they happen.",
    url: "https://behalfid.com",
    siteName: "BehalfID",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "BehalfID - Permission passports for AI agents",
    description: "Connect agents, define permissions, and verify actions before they happen."
  },
  icons: {
    icon: "/behalf_symbols.png",
    apple: "/behalf_symbols.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
