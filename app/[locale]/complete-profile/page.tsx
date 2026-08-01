import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { CompleteProfilePage } from "@/app/complete-profile/complete-profile-client";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Complete profile — BehalfID",
  description: "Finish creating your BehalfID account after OAuth sign-in.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/complete-profile" }
};

export default async function CompleteProfileLocaleRoute({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<main className="auth-page"><p>Loading…</p></main>}>
      <CompleteProfilePage />
    </Suspense>
  );
}
