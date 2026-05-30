import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { DocsShell } from "./content";
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
  const t = await getTranslations({ locale, namespace: "docs.index.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/docs" }
  };
}

export default async function DocsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  const cards = [
    { href: "/docs/quickstart" as const,       title: t("quickstart"),     body: "Create an agent, add a permission, install the SDK, verify before execution, and test allowed and denied requests." },
    { href: "/docs/cli" as const,               title: t("cli"),            body: "Install the behalf CLI, wire up the MCP server, and launch Claude Code or Codex with BehalfID enforcement active." },
    { href: "/docs/deploy-approvals" as const,  title: t("deployApprovals"), body: "Full demo: coding agent attempts production deploy → BehalfID blocks → you approve in the dashboard → agent retries → deploy runs." },
    { href: "/docs/sdk" as const,               title: t("sdk"),            body: "Install the JavaScript SDK from npm and call behalf.verify() before tool execution from Node 18+." },
    { href: "/docs/api" as const,               title: t("api"),            body: "Use public REST endpoints for agents, permissions, verification, logs, and key rotation." },
    { href: "/docs/webhooks" as const,          title: t("webhooks"),       body: "Receive signed events for allowed, denied, and approval-required decisions via an outbox-backed delivery system." },
    { href: "/docs/concepts" as const,          title: t("concepts"),       body: "Understand permission passports, fail-closed enforcement, approval-required flows, audit logs, and MCP enforcement." },
    { href: "/security" as const,               title: t("security"),       body: "How BehalfID handles secrets, tokens, fail-closed enforcement, audit logs, and current limitations." },
    { href: "/docs/site-guard" as const,        title: t("siteGuard"),      body: "Design website middleware, workers, or gateways that enforce AI access rules before protected routes run." },
    { href: "/docs/action-gateway" as const,    title: t("actionGateway"),  body: "Route safe public web reads through BehalfID so denied actions fail before execution." },
  ];

  return (
    <DocsShell
      title={t("index.title")}
      description={t("index.description")}
      next={{ href: "/docs/quickstart", label: t("quickstart") }}
    >
      <div className="docs-links">
        {cards.map((card) => (
          <Link href={card.href} key={card.href}>
            <strong>{card.title}</strong>
            <span>{card.body}</span>
          </Link>
        ))}
      </div>
    </DocsShell>
  );
}
