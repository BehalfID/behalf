import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { ButtonLink, CodeBlock } from "@/components/ui";
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
  const t = await getTranslations({ locale, namespace: "designPartners.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/design-partners" }
  };
}

export default async function DesignPartnersPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "designPartners" });

  return (
    <main id="main-content" className="marketing public-site" tabIndex={-1}>
      <PublicNav />

      <div className="blog-page">
        <header className="blog-hero">
          <p className="section-kicker">{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p className="blog-lede">{t("lede")}</p>
        </header>

        <div className="blog-prose">
          <h2>{t("whatBuilding")}</h2>
          <p>
            BehalfID is runtime action authorization for AI agents. Before a tool
            call runs, the agent checks whether it&apos;s permitted. If the action
            requires approval, the agent pauses and waits for a human to approve
            in the dashboard. If it&apos;s denied, the action stops. Every decision
            is logged.
          </p>
          <p>
            The first workflow we&apos;ve focused on is deploy authorization for coding
            agents. The agent can deploy to staging freely; production deploys
            pause for human approval via the BehalfID MCP server. Setup takes
            about five minutes.
          </p>
          <CodeBlock label="what the agent sees when blocked">{`APPROVAL REQUIRED — do not execute this action.

Action:      deploy_production on vercel.com
Approval ID: apr_Def456uvw

Approve at: https://behalfid.com/dashboard/approvals`}</CodeBlock>
          <p>
            This is an early product. The core enforcement loop works end-to-end.
            We&apos;re looking for real usage to find the edges.
          </p>

          <h2>{t("whoLookingFor")}</h2>
          <ul>
            <li>
              <strong>Teams using Claude Code, Codex, or Cursor</strong> in a
              real development workflow — not just evaluating.
            </li>
            <li>
              <strong>Engineers who want approval gates</strong> before agents
              touch production: deploys, database migrations, secret rotation,
              external communications.
            </li>
            <li>
              <strong>Teams with at least one person</strong> who can spend 30
              minutes setting up the integration and giving us honest feedback.
            </li>
            <li>
              <strong>Small teams or solo builders</strong> — you don&apos;t need
              a company or a use case that looks like enterprise.
            </li>
          </ul>

          <h2>{t("whatYouGet")}</h2>
          <ul>
            <li>
              <strong>Direct setup help.</strong> We&apos;ll walk through the
              integration with you and unblock anything that doesn&apos;t work.
            </li>
            <li>
              <strong>Early access to features</strong> as we build them — better
              approval notifications, team support, webhook routing, and more.
            </li>
            <li>
              <strong>Direct input on what we build next.</strong> Your use case
              will directly influence the roadmap.
            </li>
            <li>
              <strong>Free Pro plan</strong> for the duration of the design
              partner engagement.
            </li>
          </ul>

          <h2>{t("whatWeNeed")}</h2>
          <ul>
            <li>
              A 30-minute setup call to walk through your workflow and get
              BehalfID wired in.
            </li>
            <li>
              Honest feedback on what&apos;s confusing, broken, or missing — in
              writing or on a short call.
            </li>
            <li>
              Occasional check-ins as we ship new features. No long-term
              commitment; you can stop any time.
            </li>
          </ul>

          <div className="blog-note">
            <strong>Important:</strong> BehalfID enforces where you integrate it.
            If your agent calls an API directly without going through the MCP tool
            or SDK, that call is not covered. We&apos;ll help you understand exactly
            what is and isn&apos;t enforced in your setup before you rely on it for
            anything critical.
          </div>

          <h2>{t("getInTouch")}</h2>
          <p>
            Email us at{" "}
            <a href={`mailto:${t("contactEmail")}`}>{t("contactEmail")}</a>{" "}
            with a sentence or two about what you&apos;re building and what kind of
            approval gates you&apos;re trying to enforce. We respond within one business day.
          </p>
          <p>
            Or create an account and try the deploy approval workflow yourself —
            it&apos;s fully functional and takes five minutes to set up.
          </p>
          <div className="home-actions" style={{ marginTop: "2rem" }}>
            <ButtonLink href="/signup" variant="primary">{t("createAccount")}</ButtonLink>
            <ButtonLink href="/docs/deploy-approvals">{t("readGuide")}</ButtonLink>
          </div>

          <h2>{t("wontPromise")}</h2>
          <p>
            We&apos;re a small team and this is an early product. We won&apos;t promise
            enterprise SLAs, SOC 2, or a white-glove onboarding process. Sign in with Google
            and workspace Google SSO are available today; SAML and other IdPs are not.
            We will promise to respond quickly, fix things that are broken, and
            build what actually helps your workflow.
          </p>
          <p>
            If you need production-grade guarantees now, BehalfID is probably
            not ready for your use case yet. We&apos;re building toward that, and
            design-partner feedback is how we get there faster.
          </p>
        </div>
      </div>

      <PublicFooter />
    </main>
  );
}
