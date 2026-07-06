import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { CLI_NPM_INSTALL_COMMAND } from "@/lib/cliInstallCommands";
import { CodeBlock, DocsShell } from "../content";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "docs" });
  return { title: `${t("cli")} — BehalfID`, description: "Install the BehalfID CLI to manage agents, verify actions, enforce permissions via MCP, and launch AI tools with enforcement active.", alternates: { canonical: "/docs/cli" } };
}

export default async function CliDocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title="behalf CLI"
      description="Install the BehalfID CLI to manage agents, verify actions, enforce permissions via MCP, and launch AI tools with enforcement active."
      previous={{ href: "/docs/quickstart", label: t("quickstart") }}
      next={{ href: "/docs/deploy-approvals", label: t("deployApprovals") }}
    >
      <h2>Install</h2>
      <p>The CLI ships as a self-contained binary. No Node.js required after install.</p>
      <CodeBlock label="curl (macOS / Linux)">{`curl -fsSL https://behalfid.com/install.sh | sh`}</CodeBlock>
      <CodeBlock label="npm (global)">{CLI_NPM_INSTALL_COMMAND}</CodeBlock>

      <h2>Authenticate</h2>
      <CodeBlock label="terminal">{`behalf login`}</CodeBlock>

      <h2>Create an agent</h2>
      <CodeBlock label="terminal">{`behalf agents create "Claude Code" --provider claude-code`}</CodeBlock>

      <h2>Add a permission</h2>
      <CodeBlock label="terminal">{`behalf permissions create agent_xxx \\
  --action deploy --resource vercel.com \\
  --requires-approval`}</CodeBlock>

      <h2>Set up MCP enforcement</h2>
      <CodeBlock label="terminal">{`behalf mcp init && behalf claude`}</CodeBlock>

      <h2>Verify from the CLI</h2>
      <CodeBlock label="terminal">{`behalf verify --agent agent_xxx --action deploy --vendor vercel.com`}</CodeBlock>
    </DocsShell>
  );
}
