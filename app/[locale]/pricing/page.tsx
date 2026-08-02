import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { PricingPage } from "@/components/marketing/PricingPage";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Pricing — BehalfID",
  description:
    "Plan limits for agent identity, verification volume, approvals, and retention. Start free; upgrade when you enforce in production.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — BehalfID",
    description:
      "Plan limits for agent identity, verification volume, approvals, and retention. Start free; upgrade when you enforce in production.",
    url: "https://behalfid.com/pricing",
    siteName: "BehalfID",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — BehalfID",
    description:
      "Plan limits for agent identity, verification volume, approvals, and retention."
  }
};

export default async function LocalePricingPage({
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
  return <PricingPage authAction={authAction} googleEnabled={googleEnabled} />;
}
