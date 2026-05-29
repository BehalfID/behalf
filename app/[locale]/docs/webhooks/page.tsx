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
  return { title: `${t("webhooks")} — BehalfID`, description: "Subscribe to verification, agent, and permission events. BehalfID signs each event and delivers through a durable outbox with retries.", alternates: { canonical: "/docs/webhooks" } };
}

export default async function WebhookDocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title="Webhooks"
      description="Subscribe to verification, agent, and permission events. BehalfID signs each event and delivers through a durable outbox."
      previous={{ href: "/docs/action-gateway", label: t("actionGateway") }}
      next={{ href: "/docs/site-guard", label: t("siteGuard") }}
    >
      <h2>Event types</h2>
      <div className="docs-chip-grid">
        {["verification.allowed", "verification.denied", "agent.created", "agent.disabled", "agent.enabled", "agent.key_rotated", "permission.created", "permission.revoked"].map((event) => <code key={event}>{event}</code>)}
      </div>

      <h2>Payload structure</h2>
      <CodeBlock label="webhook event">{`{
  "eventId": "evt_xxx",
  "type": "verification.denied",
  "agentId": "agent_xxx",
  "requestId": "req_xxx",
  "decision": {
    "allowed": false,
    "reason": "Amount exceeds maxAmount constraint.",
    "risk": "high"
  },
  "timestamp": "2026-05-18T12:00:00Z"
}`}</CodeBlock>

      <h2>Verify signatures</h2>
      <CodeBlock label="receiver.ts">{`import { verifyWebhookSignature } from "@behalfid/sdk";

const isValid = verifyWebhookSignature(
  process.env.BEHALFID_WEBHOOK_SECRET!,
  rawBody,
  request.headers.get("X-BehalfID-Signature")!
);

if (!isValid) {
  return new Response("Unauthorized", { status: 401 });
}`}</CodeBlock>
    </DocsShell>
  );
}
