import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
import { shouldForceAccountSetup } from "@/lib/onboardingRedirect";
import { AuthPage } from "../auth-client";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.signupMeta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/signup" }
  };
}

export default async function SignupPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentDeveloper();
  if (user) {
    if (await shouldForceAccountSetup(user.userId)) redirect("/onboarding");
    redirect("/dashboard");
  }
  return <AuthPage mode="signup" />;
}
