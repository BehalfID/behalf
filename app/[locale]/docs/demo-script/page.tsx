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
  return { title: `Demo Script — BehalfID`, description: "A terminal-first script for recording a short demo of the coding-agent deploy approval workflow.", alternates: { canonical: "/docs/demo-script" } };
}

export default async function DemoScriptPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title="Demo script — 60-second deploy approval"
      description="A terminal-first script for recording a short demo of the coding-agent deploy approval workflow. Pre-setup takes ~5 minutes; the recording is 60–90 seconds."
      previous={{ href: "/docs/deploy-approvals", label: t("deployApprovals") }}
      next={{ href: "/docs/api", label: t("api") }}
    >
      <h2>Before you record</h2>
      <p>Complete all setup off-camera. Create an agent, add the two deploy permissions (staging allowed, production requires-approval), run <code>behalf mcp init && behalf claude</code>.</p>

      <h2>Recording script</h2>
      <ol>
        <li>Ask the agent: <em>&ldquo;Deploy the latest build to staging.&rdquo;</em> — It succeeds immediately.</li>
        <li>Ask the agent: <em>&ldquo;Now deploy to production.&rdquo;</em> — It returns the approval-required message.</li>
        <li>Open the BehalfID dashboard → Approvals → Approve.</li>
        <li>Ask the agent to retry — it succeeds.</li>
        <li>Show the audit log with all four steps recorded.</li>
      </ol>

      <h2>Expected agent output (blocked)</h2>
      <CodeBlock label="what the agent sees">{`APPROVAL REQUIRED — do not execute this action.

Action:      deploy_production on vercel.com
Approval ID: apr_Def456uvw

Approve at: https://behalfid.com/dashboard/approvals`}</CodeBlock>
    </DocsShell>
  );
}
