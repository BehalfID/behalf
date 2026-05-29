import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { CodeBlock, DocsShell } from "../content";
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
      title="Quickstart"
      description="Create an agent, add one permission, verify before execution, and prove both allowed and denied actions in about five minutes."
      previous={{ href: "/docs", label: t("overview") }}
      next={{ href: "/docs/cli", label: t("cli") }}
    >
      <h2>The five-minute model</h2>
      <p>
        BehalfID sits between the AI agent and the tool it wants to run. Your code asks
        BehalfID first. If the decision is not allowed, the executor does not run.
      </p>
      <ol className="docs-steps">
        <li><strong>Create an agent.</strong> Use <code>/dashboard/onboarding</code> or <code>behalf agents create</code>. Store the one-time <code>bhf_sk_...</code> API key as <code>BEHALFID_API_KEY</code>.</li>
        <li><strong>Create a permission.</strong> Start with one clear rule — for a coding agent: <code>deploy</code> on <code>vercel.com</code> with <code>requiresApproval: true</code> for production.</li>
        <li><strong>Install the SDK.</strong> Add the published Node SDK to the app that owns the tool execution.</li>
        <li><strong>Call verify before the action.</strong> The SDK requires <code>agentId</code>, <code>action</code>, and the API key.</li>
        <li><strong>Fail closed.</strong> Throw or return before the executor. Never run the tool when <code>decision.allowed</code> is false.</li>
      </ol>

      <CodeBlock label="terminal">{`npm install @behalfid/sdk`}</CodeBlock>

      <h2>Copy-paste executor pattern</h2>
      <CodeBlock label="deploy.ts">{`import { BehalfID } from "@behalfid/sdk";

const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
});

const agentId = process.env.BEHALFID_AGENT_ID!;

async function deployToProduction(vendor: string) {
  const decision = await behalf.verify({
    agentId,
    action: "deploy_production",
    vendor,
  });

  if (!decision.allowed) {
    throw new Error(\`Blocked by BehalfID: \${decision.reason}\`);
  }

  return runDeploy({ vendor, env: "production" });
}`}</CodeBlock>

      <h2>Allowed request</h2>
      <CodeBlock label="allowed response">{`{
  "requestId": "req_xxx",
  "allowed": true,
  "reason": "Action allowed by active permission.",
  "risk": "low"
}`}</CodeBlock>

      <h2>Approval-required request</h2>
      <CodeBlock label="approval-required response">{`{
  "requestId": "req_xxx",
  "allowed": false,
  "reason": "Permission requires approval before execution.",
  "risk": "medium"
}`}</CodeBlock>

      <h2>Denied request</h2>
      <CodeBlock label="denied response">{`{
  "requestId": "req_xxx",
  "allowed": false,
  "reason": "Amount exceeds maxAmount constraint.",
  "risk": "high"
}`}</CodeBlock>
    </DocsShell>
  );
}
