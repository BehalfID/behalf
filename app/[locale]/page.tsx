import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { MarketingHomePage, homepageMetadata } from "@/components/marketing-v2/MarketingHomePage";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export function generateMetadata(): Metadata {
  return homepageMetadata;
}

export default async function LocaleHomePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MarketingHomePage />;
}
