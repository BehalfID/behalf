import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { DocsShell } from "../content";
import { TroubleshootingBody } from "@/app/docs/_shared/troubleshootingBody";
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
  const t = await getTranslations({ locale, namespace: "docs" });
  return {
    title: `${t("troubleshooting")} — BehalfID`,
    description:
      "Diagnose verify failures, CLI doctor checks, auth errors, webhook delivery problems, and installer error codes with actionable fixes.",
    alternates: { canonical: "/docs/troubleshooting" }
  };
}

export default async function TroubleshootingPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title={t("troubleshooting")}
      description="Diagnose verify failures, CLI and install doctor output, auth errors, and webhook delivery problems — with the same reason strings and error codes the product returns."
      previous={{ href: "/docs/concepts", label: t("concepts") }}
      next={{ href: "/security", label: t("security") }}
    >
      <TroubleshootingBody />
    </DocsShell>
  );
}
