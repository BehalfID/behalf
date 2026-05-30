import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { ButtonLink, CodeBlock, HomeDemo, SplitCTAButton } from "@/components/ui";
import { HomeTour } from "@/components/ui/HomeTour";
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
  const t = await getTranslations({ locale, namespace: "home.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/" }
  };
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://behalfid.com/#organization",
      name: "BehalfID",
      url: "https://behalfid.com",
      description: "BehalfID builds permission infrastructure for AI agents."
    },
    {
      "@type": "WebSite",
      "@id": "https://behalfid.com/#website",
      name: "BehalfID",
      url: "https://behalfid.com",
      description: "The permission layer between agents and action.",
      publisher: { "@id": "https://behalfid.com/#organization" },
      datePublished: "2026-05-03",
      dateModified: "2026-05-18"
    }
  ]
};

export default async function Home({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const th = await getTranslations({ locale, namespace: "home.hero" });
  const ts = await getTranslations({ locale, namespace: "home.steps" });
  const tc = await getTranslations({ locale, namespace: "home.code" });
  const td = await getTranslations({ locale, namespace: "home.deploy" });
  const tct = await getTranslations({ locale, namespace: "home.cta" });

  return (
    <main id="main-content" className="marketing public-site" tabIndex={-1}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicNav />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="home-hero">
        <p className="section-kicker">{th("kicker")}</p>
        <h1 className="home-h1">
          {th("h1Line1")}<br />{th("h1Line2")}
        </h1>
        <p className="home-sub home-sub--advanced">{th("subAdvanced")}</p>
        <p className="home-sub home-sub--simple">{th("subSimple")}</p>
        <div className="home-code__links" aria-label={th("permissionExamples")}>
          <span>{th("example1")}</span>
          <span>{th("example2")}</span>
          <span>{th("example3")}</span>
        </div>
        <div className="home-actions">
          <SplitCTAButton leftLabel={th("build")} leftHref="/signup" rightLabel={th("tryIt")} rightHref="/sandbox" className="split-cta--ghost" />
          <HomeTour />
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section className="home-steps" aria-labelledby="steps-heading">
        <div className="home-steps__intro" data-reveal>
          <p className="section-kicker">{ts("kicker")}</p>
          <h2 id="steps-heading" className="home-steps__h2">
            {ts("h2Line1")}<br />{ts("h2Line2")}
          </h2>
        </div>

        <ol className="home-steps__list">
          <li className="home-step">
            <div className="home-step__left">
              <span className="home-step__num">01</span>
              <h3 className="home-step__title">{ts("step1Title")}</h3>
              <p className="home-step__body">{ts("step1Body")}</p>
            </div>
            <div className="home-step__visual" aria-hidden="true">
              <span className="sv-label">ACTION REQUEST</span>
              <div className="sv-rows">
                <div><span>agent</span><code>agent_claude_code</code></div>
                <div><span>action</span><code>deploy</code></div>
                <div><span>vendor</span><code>vercel.com</code></div>
                <div><span>env</span><code>production</code></div>
              </div>
            </div>
          </li>

          <li className="home-step home-step--check">
            <div className="home-step__left">
              <span className="home-step__num">02</span>
              <h3 className="home-step__title">{ts("step2Title")}</h3>
              <p className="home-step__body">{ts("step2Body")}</p>
            </div>
            <div className="home-step__visual home-step__visual--accent" aria-hidden="true">
              <span className="sv-label sv-label--accent">BEHALFID · DECISION BOUNDARY</span>
              <div className="sv-rows">
                <div><span>passport</span><code>passport_claude</code></div>
                <div><span>active</span><code>3 permissions</code></div>
                <div><span>deploy prod</span><code className="sv-muted">requires approval</code></div>
              </div>
            </div>
          </li>

          <li className="home-step home-step--decision">
            <div className="home-step__left">
              <span className="home-step__num">03</span>
              <h3 className="home-step__title">{ts("step3Title")}</h3>
              <p className="home-step__body">
                {ts("step3Body1")}
                <code className="hi-code">allowed</code>,{" "}
                <code className="hi-code">denied</code>
                {ts("step3Body2")}
                <code className="hi-code">allowed</code>
                {ts("step3Body3")}
              </p>
            </div>
            <div className="home-step__visual home-step__visual--deny" aria-hidden="true">
              <span className="sv-label">DECISION</span>
              <strong className="sv-verdict sv-verdict--deny">denied</strong>
              <code className="sv-reason">Permission requires approval before execution.</code>
              <div className="sv-rows sv-rows--sm">
                <div><span>execution</span><code className="sv-muted">false</code></div>
                <div><span>requestId</span><code>req_Abc123xyz</code></div>
              </div>
            </div>
          </li>

          <li className="home-step">
            <div className="home-step__left">
              <span className="home-step__num">04</span>
              <h3 className="home-step__title">{ts("step4Title")}</h3>
              <p className="home-step__body">{ts("step4Body")}</p>
            </div>
            <div className="home-step__visual home-step__visual--ok" aria-hidden="true">
              <span className="sv-label sv-label--ok">AUDIT EVENT · LOGGED</span>
              <div className="sv-rows">
                <div><span>requestId</span><code>req_Abc123xyz</code></div>
                <div><span>event</span><code>verification.denied</code></div>
                <div><span>agent</span><code>agent_ollie</code></div>
                <div><span>action</span><code>purchase · $742.00</code></div>
              </div>
            </div>
          </li>
        </ol>
      </section>

      {/* ── Integration ───────────────────────────────────── */}
      <section className="home-code" aria-labelledby="code-heading">
        <div className="home-code__text" data-reveal>
          <p className="section-kicker">{tc("kicker")}</p>
          <h2 id="code-heading" className="home-code__h2">
            {tc("h2Line1")}<br />{tc("h2Line2")}
          </h2>
          <p className="home-code__body mode-advanced-only">
            {tc("bodyAdvanced").replace(/<[^>]+>/g, "")}
          </p>
          <p className="home-code__body mode-simple-only">{tc("bodySimple")}</p>
          <div className="home-code__links">
            <Link href="/docs/quickstart">{tc("quickstart")}</Link>
            <Link href="/docs/sdk">{tc("sdkRef")}</Link>
          </div>
        </div>

        <div className="home-code__block mode-advanced-only" data-reveal>
          <CodeBlock label="enforce.ts">{`const decision = await behalf.verify({
  agentId: "agent_claude_code",
  action:  "deploy",
  vendor:  "vercel.com",
});

if (!decision.allowed) {
  // Blocked — reason logged, webhook fired
  throw new Error(decision.reason);
}

// Deploy only runs when decision.allowed === true`}</CodeBlock>
        </div>

        <div className="home-flow-diagram mode-simple-only" aria-label={tc("verificationFlow")} data-reveal>
          <div className="home-flow-node">
            <span className="home-flow-node__label">{tc("aiAgent")}</span>
            <span className="home-flow-node__sub">{tc("wantsToAct")}</span>
          </div>
          <div className="home-flow-node home-flow-node--center">
            <span className="home-flow-node__label">BehalfID</span>
            <span className="home-flow-node__sub">{tc("checksRules")}</span>
          </div>
          <div className="home-flow-node">
            <div className="home-flow-outcomes">
              <span className="home-flow-outcome home-flow-outcome--ok">{tc("goAhead")}</span>
              <span className="home-flow-outcome home-flow-outcome--deny">{tc("blocked")}</span>
              <span className="home-flow-outcome home-flow-outcome--warn">{tc("askFirst")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Deploy approval workflow ──────────────────────── */}
      <section className="home-deploy" aria-labelledby="deploy-heading">
        <div className="home-deploy__intro" data-reveal>
          <p className="section-kicker">{td("kicker")}</p>
          <h2 id="deploy-heading" className="home-deploy__h2">
            {td("h2Line1")}<br />{td("h2Line2")}
          </h2>
          <p className="home-deploy__body mode-advanced-only">{td("bodyAdvanced")}</p>
          <p className="home-deploy__body mode-simple-only">{td("bodySimple")}</p>
        </div>

        <ol className="home-deploy__steps">
          <li>
            <span className="home-deploy__num">01</span>
            <div>
              <h3>{td("step1Title")}</h3>
              <p>{td("step1Body")}</p>
              <div className="mode-advanced-only">
                <CodeBlock label="terminal">{`behalf permissions create agent_xxx \\
  --action deploy --resource vercel.com \\
  --blocked "deploy to production"

behalf permissions create agent_xxx \\
  --action deploy_production --resource vercel.com \\
  --requires-approval`}</CodeBlock>
              </div>
              <div className="home-deploy-simple mode-simple-only">
                <div className="home-deploy-simple__card">
                  <span className="home-deploy-simple__num">A</span>
                  <div className="home-deploy-simple__text">
                    <strong>{td("step1SimpleATitle")}</strong>
                    <p>{td("step1SimpleABody")}</p>
                  </div>
                </div>
                <div className="home-deploy-simple__card">
                  <span className="home-deploy-simple__num">B</span>
                  <div className="home-deploy-simple__text">
                    <strong>{td("step1SimpleBTitle")}</strong>
                    <p>{td("step1SimpleBBody")}</p>
                  </div>
                </div>
              </div>
            </div>
          </li>

          <li>
            <span className="home-deploy__num">02</span>
            <div>
              <h3>{td("step2Title")}</h3>
              <p className="mode-advanced-only">{td("step2BodyAdvanced").replace(/<[^>]+>/g, "")}</p>
              <div className="mode-advanced-only">
                <CodeBlock label="terminal">{`behalf mcp init && behalf claude`}</CodeBlock>
              </div>
              <p className="mode-simple-only">{td("step2BodySimple")}</p>
            </div>
          </li>

          <li>
            <span className="home-deploy__num">03</span>
            <div>
              <h3>{td("step3Title")}</h3>
              <p>
                <span className="mode-advanced-only"><code>verify_action</code>. BehalfID </span>
                <span className="mode-simple-only">{td("step3BodySimple")}</span>
              </p>
              <CodeBlock label="what the agent sees">{`APPROVAL REQUIRED — do not execute this action.

Action:      deploy_production on vercel.com
Approval ID: apr_Def456uvw

Approve at: https://behalfid.com/dashboard/approvals`}</CodeBlock>
            </div>
          </li>

          <li>
            <span className="home-deploy__num">04</span>
            <div>
              <h3>{td("step4Title")}</h3>
              <p className="mode-advanced-only">{td("step4BodyAdvanced").replace(/<[^>]+>/g, "")}</p>
              <p className="mode-simple-only">{td("step4BodySimple")}</p>
            </div>
          </li>
        </ol>

        <div className="home-deploy__cta">
          <ButtonLink href="/docs/deploy-approvals">{td("readGuide")}</ButtonLink>
        </div>
      </section>

      {/* ── Interactive demo ──────────────────────────────── */}
      <HomeDemo />

      {/* ── Final CTA ─────────────────────────────────────── */}
      <section className="home-cta" aria-labelledby="cta-heading">
        <p className="section-kicker">{tct("kicker")}</p>
        <h2 id="cta-heading" className="home-cta__h2">{tct("h2")}</h2>
        <p className="home-cta__body">{tct("body")}</p>
        <div className="home-actions home-actions--center">
          <SplitCTAButton leftLabel={th("build")} leftHref="/signup" rightLabel={th("tryIt")} rightHref="/sandbox" className="split-cta--ghost" />
          <ButtonLink href="/docs/deploy-approvals">{tct("tryDeploy")}</ButtonLink>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
