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
  return { title: `${t("actionGateway")} — BehalfID`, description: "Route safe public web reads through BehalfID so denied actions fail before execution. Proxy HTTP requests with permission enforcement built in.", alternates: { canonical: "/docs/action-gateway" } };
}

export default async function ActionGatewayDocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title="Action Gateway"
      description="Verify checks whether an action is allowed. The Action Gateway enforces that decision by executing only supported allowed actions through BehalfID."
      previous={{ href: "/docs/sdk", label: t("sdk") }}
      next={{ href: "/docs/webhooks", label: t("webhooks") }}
    >
      <h2>MVP scope</h2>
      <p>The current gateway supports one safe executor: public web reads. It accepts a URL and returns the page content only when the corresponding <code>browse_web</code> permission is allowed.</p>

      <h2>Usage</h2>
      <CodeBlock label="execute.ts">{`const result = await behalf.executeAction({
  agentId: "agent_xxx",
  action: "browse_web",
  resource: "example.com",
  params: { url: "https://example.com/page" },
});

// result.output contains the page content when allowed
// result.allowed === false when denied`}</CodeBlock>

      <h2>REST endpoint</h2>
      <CodeBlock label="POST /api/actions/execute">{`{
  "agentId": "agent_xxx",
  "action": "browse_web",
  "resource": "example.com",
  "params": {
    "url": "https://example.com/page"
  }
}`}</CodeBlock>
    </DocsShell>
  );
}
