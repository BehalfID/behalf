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
  return { title: `${t("api")} — BehalfID`, description: "Use public REST endpoints for agents, permissions, verification, logs, and key rotation. Requires an API key.", alternates: { canonical: "/docs/api" } };
}

export default async function ApiDocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  const endpoints = [
    ["POST", "/api/agents", "Add a native or connected agent and return the API key once."],
    ["POST", "/api/permissions", "Create a permission for the authenticated agent."],
    ["POST", "/api/verify", "Evaluate whether an agent can perform an action."],
    ["POST", "/api/actions/execute", "Execute an allowed safe public web read through the Action Gateway MVP."],
    ["GET", "/api/logs/[agentId]", "Read filtered verification logs and summaries for the authenticated agent."],
    ["POST", "/api/agents/[agentId]/rotate-key", "Rotate an agent API key and return the new key once."]
  ];

  return (
    <DocsShell
      title="API Reference"
      description="Use public REST endpoints for agents, permissions, verification, logs, and key rotation. Requires an API key."
      previous={{ href: "/docs/deploy-approvals", label: t("deployApprovals") }}
      next={{ href: "/docs/sdk", label: t("sdk") }}
    >
      <h2>Authentication</h2>
      <p>All authenticated endpoints require <code>Authorization: Bearer bhf_sk_…</code>.</p>

      <h2>Endpoints</h2>
      <table className="docs-table">
        <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
        <tbody>
          {endpoints.map(([method, path, desc]) => (
            <tr key={path}><td><code>{method}</code></td><td><code>{path}</code></td><td>{desc}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>POST /api/verify</h2>
      <CodeBlock label="request body">{`{
  "agentId": "agent_xxx",
  "action": "deploy_production",
  "vendor": "vercel.com",
  "amount": 0,
  "metadata": {}
}`}</CodeBlock>
      <CodeBlock label="response">{`{
  "requestId": "req_xxx",
  "allowed": false,
  "reason": "Permission requires approval before execution.",
  "risk": "medium"
}`}</CodeBlock>
    </DocsShell>
  );
}
