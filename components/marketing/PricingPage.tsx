"use client";

import { useState } from "react";
import Link from "next/link";
import { MarketingLayout, Section, SectionHeading } from "@/components/design-system/MarketingLayout";
import { Check, Minus } from "@/components/design-system/icons";
import { TrustCallout } from "@/components/design-system/TrustCallout";
import { cn } from "@/lib/cn";
import { crossAppClickHandler } from "@/lib/subdomainRouting";
import {
  BUSINESS_PLAN_PRICE_CENTS,
  PLAN_ENTITLEMENTS,
  PRO_PLAN_PRICE_CENTS,
  TEAM_PLAN_PRICE_CENTS,
  formatLimit
} from "@/lib/plans";
import type { PublicAuthAction } from "@/lib/publicAuthAction";

const free = PLAN_ENTITLEMENTS.free;
const pro = PLAN_ENTITLEMENTS.pro;
const team = PLAN_ENTITLEMENTS.team;
const business = PLAN_ENTITLEMENTS.business;
const enterprise = PLAN_ENTITLEMENTS.enterprise;

const plans = [
  {
    name: "Free",
    descriptor: "solo builders",
    price: "$0",
    cadence: "forever",
    blurb: "Evaluate enforcement against real agent traffic — then upgrade when you go to production.",
    cta: "Start free",
    href: "/signup",
    features: [
      `${formatLimit(free.maxAgents)} agents`,
      `${formatLimit(free.monthlyVerifications)} verifications / month`,
      `${free.logRetentionDays}-day activity retention`,
      "Managed profiles & pause approvals",
      "Community support"
    ]
  },
  {
    name: "Pro",
    descriptor: "small eng teams",
    price: `$${PRO_PLAN_PRICE_CENTS / 100}`,
    cadence: "per month",
    anchor: `$${PRO_PLAN_PRICE_CENTS / 100}/mo — less than the cost of one avoided production incident.`,
    blurb: "For small teams enforcing permissions, webhooks and approvals in production.",
    cta: "Start building",
    href: "/signup",
    featured: true,
    features: [
      `${formatLimit(pro.maxAgents)} agents`,
      `${formatLimit(pro.monthlyVerifications)} verifications / month`,
      `${pro.logRetentionDays}-day activity retention`,
      "Webhooks & workspace SSO controls",
      `${formatLimit(pro.maxBillableUsers)} billable seats`,
      "7-day trial · email support"
    ]
  },
  {
    name: "Team",
    descriptor: "growing product orgs",
    price: `$${TEAM_PLAN_PRICE_CENTS / 100}`,
    cadence: "per month",
    blurb: "More seats, agents, and verification volume for teams past the first production agents.",
    cta: "Start building",
    href: "/signup",
    features: [
      `${formatLimit(team.maxAgents)} agents`,
      `${formatLimit(team.monthlyVerifications)} verifications / month`,
      `${team.logRetentionDays}-day activity retention`,
      `${formatLimit(team.maxBillableUsers)} billable seats`,
      `${formatLimit(team.maxProtectedRepos)} protected repos`,
      "Webhooks & workspace SSO"
    ]
  },
  {
    name: "Business",
    descriptor: "multi-team orgs",
    price: `$${BUSINESS_PLAN_PRICE_CENTS / 100}`,
    cadence: "per month",
    blurb: "Higher volume, longer retention, and advanced audit exports for organisational rollout.",
    cta: "Start building",
    href: "/signup",
    features: [
      `${formatLimit(business.maxAgents)} agents`,
      `${formatLimit(business.monthlyVerifications)} verifications / month`,
      `${business.logRetentionDays}-day activity retention`,
      `${formatLimit(business.maxBillableUsers)} billable seats`,
      "Advanced audit exports",
      "Webhooks & workspace SSO"
    ]
  },
  {
    name: "Enterprise",
    descriptor: "security-reviewed orgs",
    price: "Custom",
    cadence: "annual",
    blurb: "For organisations that need custom retention, procurement and security review.",
    cta: "Contact sales",
    href: "/contact",
    features: [
      "Unlimited agents & verifications",
      "Custom retention (contract)",
      "Advanced audit exports",
      "Named support engagement",
      "Security review & rollout help"
    ]
  }
];

const matrix: { label: string; values: (string | boolean)[] }[] = [
  {
    label: "Agent identities",
    values: [
      formatLimit(free.maxAgents),
      formatLimit(pro.maxAgents),
      formatLimit(team.maxAgents),
      formatLimit(business.maxAgents),
      "Unlimited"
    ]
  },
  {
    label: "Verifications / month",
    values: [
      formatLimit(free.monthlyVerifications),
      formatLimit(pro.monthlyVerifications),
      formatLimit(team.monthlyVerifications),
      formatLimit(business.monthlyVerifications),
      "Committed"
    ]
  },
  {
    label: "Billable seats",
    values: [
      formatLimit(free.maxBillableUsers),
      formatLimit(pro.maxBillableUsers),
      formatLimit(team.maxBillableUsers),
      formatLimit(business.maxBillableUsers),
      "Unlimited"
    ]
  },
  {
    label: "Webhooks",
    values: [
      free.webhooksEnabled,
      pro.webhooksEnabled,
      team.webhooksEnabled,
      business.webhooksEnabled,
      true
    ]
  },
  {
    label: "Managed agent profiles",
    values: [
      free.managedProfilesEnabled,
      pro.managedProfilesEnabled,
      team.managedProfilesEnabled,
      business.managedProfilesEnabled,
      true
    ]
  },
  {
    label: "Activity retention",
    values: [
      `${free.logRetentionDays} days`,
      `${pro.logRetentionDays} days`,
      `${team.logRetentionDays} days`,
      `${business.logRetentionDays} days`,
      `Custom / up to ${enterprise.logRetentionDays} days`
    ]
  },
  {
    label: "Workspace Google SSO controls",
    values: [
      free.googleWorkspaceSsoEnabled,
      pro.googleWorkspaceSsoEnabled,
      team.googleWorkspaceSsoEnabled,
      business.googleWorkspaceSsoEnabled,
      true
    ]
  },
  {
    label: "Advanced audit exports",
    values: [
      free.advancedAuditExportsEnabled,
      pro.advancedAuditExportsEnabled,
      team.advancedAuditExportsEnabled,
      business.advancedAuditExportsEnabled,
      enterprise.advancedAuditExportsEnabled
    ]
  },
  {
    label: "Support",
    values: ["Community", "Email", "Email", "Email", "Named engagement"]
  }
];

const faqs = [
  {
    q: "What counts as a verification?",
    a: "One evaluated decision — allowed, denied, approval required, or error. Cached repeat decisions within a short window are not double-counted toward quota where the platform coalesces them."
  },
  {
    q: "What happens when I exceed my included volume?",
    a: "Verification evaluation continues; enforcement does not degrade because of billing. Usage and plan limits are visible in the dashboard. Upgrade to the next tier if you need a higher committed volume."
  },
  {
    q: "Do you charge per agent or per seat?",
    a: "Plans include an agent allowance and a billable seat limit derived from your workspace plan. Enterprise has no practical agent or seat cap under contract."
  },
  {
    q: "Which plans can I buy today?",
    a: `Free, Pro ($${PRO_PLAN_PRICE_CENTS / 100}/mo), Team ($${TEAM_PLAN_PRICE_CENTS / 100}/mo), and Business ($${BUSINESS_PLAN_PRICE_CENTS / 100}/mo) are self-serve. Enterprise is via contact for custom contracts.`
  }
];

/**
 * Structured data mirrors the visible page: self-serve plans plus the billing
 * FAQ. Enterprise is contact-sales and is not listed as a fixed Offer price.
 */
const pricingJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://behalfid.com/#software",
      name: "BehalfID",
      url: "https://behalfid.com",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      offers: [
        {
          "@type": "Offer",
          name: "Free plan",
          price: "0",
          priceCurrency: "USD",
          url: "https://behalfid.com/pricing"
        },
        {
          "@type": "Offer",
          name: `Pro plan ($${PRO_PLAN_PRICE_CENTS / 100}/month)`,
          price: String(PRO_PLAN_PRICE_CENTS / 100),
          priceCurrency: "USD",
          url: "https://behalfid.com/pricing"
        },
        {
          "@type": "Offer",
          name: `Team plan ($${TEAM_PLAN_PRICE_CENTS / 100}/month)`,
          price: String(TEAM_PLAN_PRICE_CENTS / 100),
          priceCurrency: "USD",
          url: "https://behalfid.com/pricing"
        },
        {
          "@type": "Offer",
          name: `Business plan ($${BUSINESS_PLAN_PRICE_CENTS / 100}/month)`,
          price: String(BUSINESS_PLAN_PRICE_CENTS / 100),
          priceCurrency: "USD",
          url: "https://behalfid.com/pricing"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": "https://behalfid.com/pricing#faq",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a }
      }))
    }
  ]
};

export function PricingPage({
  authAction,
  googleEnabled
}: {
  authAction: PublicAuthAction;
  googleEnabled: boolean;
}) {
  return (
    <MarketingLayout authAction={authAction} googleEnabled={googleEnabled}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <Section>
        <SectionHeading
          eyebrow="Pricing"
          title="Start free. Upgrade when you enforce in production."
          description="Limits below come from current production entitlements. Free through Business are self-serve — no sales call. Enterprise adds custom retention, procurement, and security review — the policy engine is the same."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col rounded-xl border bg-surface p-6",
                plan.featured && "border-primary/50 shadow-raised"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {plan.name} <span className="font-normal text-muted-foreground">&mdash; {plan.descriptor}</span>
                </h3>
                {plan.featured ? (
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 ds-text-11 font-semibold uppercase ds-tracking-0_12 text-primary-foreground">
                    Most popular
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="num text-3xl font-semibold">{plan.price}</span>
                <span className="text-xs text-muted-foreground">{plan.cadence}</span>
              </div>
              {plan.anchor ? (
                <p className="mt-2 text-[13px] font-medium leading-relaxed">{plan.anchor}</p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">{plan.blurb}</p>
              <Link
                href={plan.href}
                className={cn(
                  "mt-5 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium",
                  plan.featured
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-surface text-foreground"
                )}
                onClick={crossAppClickHandler(plan.href)}
              >
                {plan.cta}
              </Link>
              {plan.featured ? <TrustCallout className="mt-3" tone="compact" /> : null}
              <ul className="mt-6 space-y-2.5 border-t pt-5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Running a security review? The{" "}
          <Link
            href="/security"
            className="text-primary underline underline-offset-2"
            onClick={crossAppClickHandler("/security")}
          >
            security model
          </Link>{" "}
          and current{" "}
          <Link
            href="/compliance"
            className="text-primary underline underline-offset-2"
            onClick={crossAppClickHandler("/compliance")}
          >
            compliance posture
          </Link>{" "}
          are documented, including what is and isn&apos;t certified today.
        </p>
      </Section>

      <Section className="bg-surface-2">
        <SectionHeading title="Compare plans" />
        <div className="mt-8 grid gap-3 lg:hidden">
          {matrix.map((row) => (
            <div key={row.label} className="rounded-lg bg-surface p-4">
              <div className="ds-text-13 font-medium">{row.label}</div>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {row.values.map((value, index) => (
                  <div key={plans[index]?.name} className="min-w-0">
                    <dt className="ds-text-11 uppercase ds-tracking-0_12 text-muted-foreground">
                      {plans[index]?.name}
                    </dt>
                    <dd className="mt-1 ds-text-13">
                      <MatrixValue value={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        <div className="mt-8 hidden overflow-x-auto rounded-lg border bg-surface lg:block">
          <table className="w-full ds-min-w-640 text-sm">
            <caption className="sr-only">
              Feature comparison across Free, Pro, Team, Business and Enterprise plans
            </caption>
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                  Feature
                </th>
                {plans.map((plan) => (
                  <th key={plan.name} scope="col" className="px-4 py-3 font-semibold">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-normal text-muted-foreground">
                    {row.label}
                  </th>
                  {row.values.map((value, index) => (
                    <td key={`${row.label}-${index}`} className="px-4 py-3">
                      <MatrixValue value={value} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <SectionHeading title="Billing questions" />
        <div className="mt-6 max-w-3xl divide-y rounded-lg border bg-surface">
          {faqs.map((faq) => (
            <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
          ))}
        </div>
      </Section>
    </MarketingLayout>
  );
}

function MatrixValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <>
        <Check className="size-4 text-success" aria-hidden />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="num">{value}</span>;
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-medium"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {question}
        <span aria-hidden className="text-muted-foreground">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{answer}</p> : null}
    </div>
  );
}
