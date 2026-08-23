import type { Metadata } from "next";
import { headers } from "next/headers";
import { Instrument_Sans, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { CookieBanner } from "@/components/ui";
import { canonicalOrigin } from "@/lib/canonicalOrigin";
import "./globals.css";
import "./design-system-foundation.css";
import "./lovable-design-system.css";
import "./lovable-utilities.css";
import "./lovable-utilities.generated.css";
import "./auth-onboarding.css";
import "./dashboard-shell.css";
import "./agents-permissions.css";
import "./approvals-activity.css";
import "./profiles-integrations.css";
import "./settings-operations.css";
import "./analytics.css";
import "./public-docs.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap"
});

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
  metadataBase: new URL(canonicalOrigin()),
  title: "BehalfID - Permission passports for AI agents",
  description: "Connect agents, define permissions, and verify actions before they happen.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "BehalfID - Permission passports for AI agents",
    description: "Connect agents, define permissions, and verify actions before they happen.",
    url: canonicalOrigin(),
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

const themeScript = `(function(){try{var m=window.matchMedia('(prefers-color-scheme:dark)');function p(){try{var v=localStorage.getItem('theme');return v==='dark'||v==='light'?v:null}catch(e){return null}}function a(){var s=p();var t=s||(m.matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);document.documentElement.classList.toggle('dark',t==='dark')}a();function c(){if(!p())a()}if(m.addEventListener)m.addEventListener('change',c);else if(m.addListener)m.addListener(c);window.addEventListener('storage',function(e){if(e.key==='theme'||e.key===null)a()})}catch(e){}})();`;
const faviconScript = `(function(){function setFavicon(t){var icons=document.querySelectorAll('link[rel~="icon"]');icons.forEach(function(el){el.href=t==='dark'?'/behalf_favicon.png':'/icon-light.png';});}try{var t=document.documentElement.getAttribute('data-theme')||'dark';setFavicon(t);new MutationObserver(function(){setFavicon(document.documentElement.getAttribute('data-theme')||'dark');}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});}catch(e){}})();`;
const modeScript  = `(function(){try{var m=localStorage.getItem('mode');document.documentElement.setAttribute('data-mode',m==='simple'?'simple':'advanced')}catch(e){}})();`;

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  let locale = "en";
  let messages: Record<string, unknown> = (await import("../messages/en.json")).default;
  try {
    locale = await getLocale();
    messages = await getMessages();
  } catch {
    // Not in a next-intl request context — fall back to English catalog.
  }
  return (
    <html lang={locale} className={`${instrumentSans.variable} ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: modeScript }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: faviconScript }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a href="#main-content" className="skip-link">Skip to main content</a>
          {children}
          <CookieBanner />
          <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
