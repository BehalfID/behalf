import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { DocsShell } from "../content";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "docs" });
  return { title: `${t("concepts")} — BehalfID`, description: "Understand permission passports, fail-closed enforcement, approval-required flows, audit logs, and MCP enforcement.", alternates: { canonical: "/docs/concepts" } };
}

export default async function ConceptsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  const concepts = [
    ["Permission passports", "A permission passport is the BehalfID record that ties an agent, its credential, permission rules, audit logs, and webhook events together."],
    ["Manual test mode", "Use this for existing agents when the provider has not integrated BehalfID. Users can test actions through a passport link and copy instructions into the agent, but BehalfID does not automatically control the external provider."],
    ["Developer integration mode", "Use this when your app or custom agent can call the BehalfID API or SDK before actions happen. This is the enforcement path."],
    ["Agents", "An agent is any AI system, workflow, or coding tool that BehalfID identifies before it tries to act. Every agent has a stable agentId and an API key used to authenticate verify() calls."],
    ["Fail-closed enforcement", "When your app calls behalf.verify() before a tool runs, denied or approval-required actions are blocked before the tool executes. This is the only fully automatic enforcement path."],
    ["Approval-required flow", "Some permissions require human approval before the action runs. The agent receives a denial with reason 'requires approval'. After approval in the dashboard, the next verify() call succeeds."],
    ["Audit logs", "Every verify() call produces an immutable log entry with request ID, agent, action, decision, risk level, and timestamp. Retained for 90 days."],
    ["Webhooks", "BehalfID delivers signed events for every decision to your registered endpoint. Verify signatures with verifyWebhookSignature before processing."],
  ];

  return (
    <DocsShell
      title="Concepts"
      description="Understand permission passports, fail-closed enforcement, approval-required flows, audit logs, and MCP enforcement."
      previous={{ href: "/docs/site-guard", label: t("siteGuard") }}
      next={{ href: "/security", label: t("security") }}
    >
      <dl className="docs-concepts">
        {concepts.map(([term, def]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{def}</dd>
          </div>
        ))}
      </dl>
    </DocsShell>
  );
}
