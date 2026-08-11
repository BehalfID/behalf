import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AboutPage, aboutMetadata } from "@/components/marketing/AboutPage";
import { getPublicAuthAction } from "@/lib/publicAuthAction";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export function generateMetadata(): Metadata {
  return aboutMetadata;
}

export default async function LocaleAboutPage({
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
  return <AboutPage authAction={authAction} googleEnabled={googleEnabled} />;
}
