import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { CodeBlock, DocsShell } from "../content";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "docs" });
  return { title: `${t("deployApprovals")} — BehalfID`, description: "Step-by-step demo: Claude Code or Codex attempts a production deploy, BehalfID blocks it, you approve in the dashboard, the agent retries and succeeds.", alternates: { canonical: "/docs/deploy-approvals" } };
}

export default async function DeployApprovalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title="Coding-agent deploy approvals"
      description="Step-by-step demo: Claude Code or Codex attempts a production deploy, BehalfID blocks it, you approve in the dashboard, the agent retries and succeeds."
      previous={{ href: "/docs/cli", label: t("cli") }}
      next={{ href: "/docs/api", label: t("api") }}
    >
      <h2>Overview</h2>
      <p>This guide walks through the complete approval loop for a coding agent that can deploy to staging freely but requires human approval before touching production.</p>

      <h2>Step 1: Set up two permissions</h2>
      <CodeBlock label="terminal">{`behalf permissions create agent_xxx \\
  --action deploy --resource vercel.com \\
  --blocked "deploy to production"

behalf permissions create agent_xxx \\
  --action deploy_production --resource vercel.com \\
  --requires-approval`}</CodeBlock>

      <h2>Step 2: Wire up MCP enforcement</h2>
      <CodeBlock label="terminal">{`behalf mcp init && behalf claude`}</CodeBlock>

      <h2>Step 3: Agent attempts production deploy — blocked</h2>
      <CodeBlock label="what the agent sees">{`APPROVAL REQUIRED — do not execute this action.

Action:      deploy_production on vercel.com
Approval ID: apr_Def456uvw

Approve at: https://behalfid.com/dashboard/approvals`}</CodeBlock>

      <h2>Step 4: Approve and retry</h2>
      <p>Click <strong>Approve</strong> in the dashboard. The agent calls <code>verify_action</code> again — now <code>allowed: true</code>. The deploy runs. Every step is in the audit log.</p>
    </DocsShell>
  );
}
