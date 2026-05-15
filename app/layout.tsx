import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { CookieBanner } from "@/components/ui";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap"
});

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

const themeScript = `(function(){try{var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <CookieBanner />
        <Analytics />
      </body>
    </html>
  );
}
