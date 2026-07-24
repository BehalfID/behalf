import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { DocsShell } from "../content";
import { QuickstartDocsBody } from "@/app/docs/_shared/quickstartBody";
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
    title: `${t("quickstart")} — BehalfID`,
    description: "Create an agent, add one permission, verify before execution, and prove both allowed and denied actions in about five minutes.",
    alternates: { canonical: "/docs/quickstart" }
  };
}

export default async function QuickstartPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title="SDK Quickstart"
      description="Create an agent, add one permission, call verify() before execution, and prove both allowed and denied actions in about five minutes."
      previous={{ href: "/docs", label: t("overview") }}
      next={{ href: "/docs/cli", label: t("cli") }}
    >
      <QuickstartDocsBody />
    </DocsShell>
  );
}
