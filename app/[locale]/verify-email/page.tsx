import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { VerifyEmailClient } from "@/app/verify-email/client";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Verify email — BehalfID",
  description: "Verify your email address to activate your BehalfID developer account.",
  alternates: { canonical: "/verify-email" }
};

export default async function VerifyEmailPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  return <VerifyEmailClient token={token} />;
}
