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
  return { title: `${t("sdk")} — BehalfID`, description: "Install @behalfid/sdk and call behalf.verify() before tool execution from Node 18+. Uses fetch with no extra dependencies.", alternates: { canonical: "/docs/sdk" } };
}

export default async function SdkDocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title="JavaScript SDK"
      description="The SDK is published as @behalfid/sdk and uses fetch, so it works in Node 18+ without extra dependencies."
      previous={{ href: "/docs/api", label: t("api") }}
      next={{ href: "/docs/action-gateway", label: t("actionGateway") }}
    >
      <h2>Install</h2>
      <CodeBlock label="terminal">{`npm install @behalfid/sdk`}</CodeBlock>

      <h2>Initialize</h2>
      <CodeBlock label="behalf.ts">{`import { BehalfID } from "@behalfid/sdk";

export const behalf = new BehalfID({
  apiKey: process.env.BEHALFID_API_KEY!,
});`}</CodeBlock>

      <h2>Verify before execution</h2>
      <CodeBlock label="enforce.ts">{`const decision = await behalf.verify({
  agentId: "agent_xxx",
  action: "deploy_production",
  vendor: "vercel.com",
});

if (!decision.allowed) {
  throw new Error(\`Blocked: \${decision.reason}\`);
}

// Safe to proceed`}</CodeBlock>

      <h2>Create a permission</h2>
      <CodeBlock label="permission.ts">{`await behalf.createPermission({
  agentId: "agent_xxx",
  action: "deploy_production",
  resource: "vercel.com",
  requiresApproval: true,
});`}</CodeBlock>
    </DocsShell>
  );
}
