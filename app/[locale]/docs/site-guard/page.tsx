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
  return { title: `${t("siteGuard")} — BehalfID`, description: "Design website middleware, workers, or gateways that enforce AI access rules before protected routes run.", alternates: { canonical: "/docs/site-guard" } };
}

export default async function SiteGuardDocsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "docs" });

  return (
    <DocsShell
      title="BehalfID Site Guard"
      description="BehalfID Site Guard lets website owners check whether an incoming request is from an authorized AI agent before executing sensitive workflows."
      previous={{ href: "/docs/webhooks", label: t("webhooks") }}
      next={{ href: "/docs/concepts", label: t("concepts") }}
    >
      <h2>What it does</h2>
      <p>Site Guard lets you add BehalfID verification to your website&apos;s middleware, edge worker, or proxy. Requests from AI agents must carry a valid passport token and the action they want to perform.</p>

      <h2>Middleware pattern</h2>
      <CodeBlock label="middleware.ts">{`import { checkSiteGuard } from "@behalfid/sdk";

export async function middleware(request: Request) {
  const passportToken = request.headers.get("X-BehalfID-Passport");
  const action = request.headers.get("X-BehalfID-Action");

  if (passportToken && action) {
    const decision = await checkSiteGuard({
      passportToken,
      action,
      resource: new URL(request.url).pathname,
    });

    if (!decision.allowed) {
      return new Response("Forbidden by BehalfID", { status: 403 });
    }
  }

  return fetch(request);
}`}</CodeBlock>
    </DocsShell>
  );
}
