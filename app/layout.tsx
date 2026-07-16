import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { CookieBanner } from "@/components/ui";
import { getLocale } from "next-intl/server";
import "./globals.css";
import "./design-system-foundation.css";
import "./auth-onboarding.css";
import "./dashboard-shell.css";
import "./agents-permissions.css";
import "./approvals-activity.css";

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
    icon: [
      { url: "/behalf_favicon.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-light.png", media: "(prefers-color-scheme: light)" }
    ],
    apple: "/behalf_favicon.png"
  }
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;
const faviconScript = `(function(){function setFavicon(t){var icons=document.querySelectorAll('link[rel~="icon"]');icons.forEach(function(el){el.href=t==='dark'?'/behalf_favicon.png':'/icon-light.png';});}try{var t=document.documentElement.getAttribute('data-theme')||'dark';setFavicon(t);new MutationObserver(function(){setFavicon(document.documentElement.getAttribute('data-theme')||'dark');}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});}catch(e){}})();`;
const modeScript  = `(function(){try{var m=localStorage.getItem('mode');document.documentElement.setAttribute('data-mode',m==='simple'?'simple':'advanced')}catch(e){}})();`;

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  let locale = "en";
  try {
    locale = await getLocale();
  } catch {
    // Not in a locale context (dashboard, api, etc.) — default to English.
  }
  return (
    <html lang={locale} className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: modeScript }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: faviconScript }} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        {children}
        <CookieBanner />
        <Analytics />
      </body>
    </html>
  );
}
