import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentDeveloper } from "@/lib/developerAuth";
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
  const t = await getTranslations({ locale, namespace: "auth.loginMeta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/login" }
  };
}

export default async function LoginPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentDeveloper();
  if (user) redirect("/dashboard");
  return <AuthPage mode="login" />;
}
