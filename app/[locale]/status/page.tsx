import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { StatusBoard } from "@/components/status/StatusBoard";
import { buildStatusLabels } from "@/lib/statusLabels";
import { getSystemStatus } from "@/lib/statusHealth";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "status.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/status" }
  };
}

export default async function StatusPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "status" });
  const status = await getSystemStatus();
  const labels = buildStatusLabels(t);

  return (
    <main id="main-content" className="marketing" tabIndex={-1}>
      <PublicNav />
      <StatusBoard status={status} labels={labels} />
      <PublicFooter />
    </main>
  );
}
