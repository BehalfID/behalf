import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdaptiveEnginePage } from "@/components/marketing/AdaptiveEnginePage";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Adaptive engine — how BehalfID learns from human decisions",
  description:
    "Observe, recommend, enforce: how BehalfID turns repeated human approval decisions into bounded, administrator-enabled rules while explicit policy stays authoritative.",
  alternates: { canonical: "/adaptive-engine" },
  openGraph: {
    title: "Adaptive engine — how BehalfID learns from human decisions",
    description:
      "Observe, recommend, enforce: how BehalfID turns repeated human approval decisions into bounded, administrator-enabled rules while explicit policy stays authoritative.",
    url: "https://behalfid.com/adaptive-engine",
    siteName: "BehalfID",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Adaptive engine — BehalfID",
    description:
      "Observe, recommend, enforce — with explicit policy authoritative and administrator control before enforcement."
  }
};

export default async function LocaleAdaptiveEnginePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const authAction = await getPublicAuthAction();
  let googleEnabled = false;
  try {
    googleEnabled = isGoogleOAuthConfigured();
  } catch {
    googleEnabled = false;
  }
  return <AdaptiveEnginePage authAction={authAction} googleEnabled={googleEnabled} />;
}
