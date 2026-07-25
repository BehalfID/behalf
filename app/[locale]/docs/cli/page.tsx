import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { DocsShell } from "../content";
import { CliDocsBody } from "@/app/docs/_shared/cliBody";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "docs" });
  return {
    title: `${t("cli")} — BehalfID`,
    description: "Install BehalfID action-time hooks, advisory MCP tools, and optional Managed Profiles launch policy for Claude Code, Codex, and Cursor.",
    alternates: { canonical: "/docs/cli" }
  };
}

export default async function CliDocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title="Coding agent quickstart (CLI & MCP)"
      description="Install the CLI, add action-time hooks where supported, expose advisory MCP tools, and optionally apply Managed Profiles launch policy."
      previous={{ href: "/docs/quickstart", label: t("quickstart") }}
      next={{ href: "/docs/deploy-approvals", label: t("deployApprovals") }}
    >
      <CliDocsBody />
    </DocsShell>
  );
}
