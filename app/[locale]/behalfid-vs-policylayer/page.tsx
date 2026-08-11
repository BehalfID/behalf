import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ComparisonPage, comparisonMetadata } from "@/components/marketing/ComparisonPage";
import { requireComparison } from "@/components/marketing/comparisons";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";
import { routing } from "@/i18n/routing";

const data = requireComparison("behalfid-vs-policylayer");

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export function generateMetadata(): Metadata {
  return comparisonMetadata(data);
}

export default async function LocaleComparisonPage({
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
  return <ComparisonPage data={data} authAction={authAction} googleEnabled={googleEnabled} />;
}
