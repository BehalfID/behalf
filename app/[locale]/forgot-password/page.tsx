import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { ForgotPasswordClient } from "@/app/forgot-password/client";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Reset password — BehalfID",
  description: "Request a password reset link for your BehalfID developer account.",
  alternates: { canonical: "/forgot-password" }
};

export default async function ForgotPasswordPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ForgotPasswordClient />;
}
