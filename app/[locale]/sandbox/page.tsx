import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { SandboxClient } from "../../sandbox/sandbox-client";
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
  const t = await getTranslations({ locale, namespace: "sandbox.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/sandbox" }
  };
}

export default async function SandboxPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />
      <SandboxClient />
      <PublicFooter />
    </main>
  );
}
