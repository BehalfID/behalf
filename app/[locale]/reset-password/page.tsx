import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { ResetPasswordClient } from "@/app/reset-password/client";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Set new password — BehalfID",
  description: "Set a new password for your BehalfID developer account.",
  alternates: { canonical: "/reset-password" }
};

export default async function ResetPasswordPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  return <ResetPasswordClient token={token} />;
}
