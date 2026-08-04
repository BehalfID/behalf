"use client";

import { useState } from "react";
import Link from "next/link";
import { MarketingLayout, Section, SectionHeading } from "@/components/design-system/MarketingLayout";
import { Check, Minus } from "@/components/design-system/icons";
import { cn } from "@/lib/cn";
import { crossAppClickHandler } from "@/lib/subdomainRouting";
import {
  PLAN_ENTITLEMENTS,
  PRO_PLAN_PRICE_CENTS,
  formatLimit
} from "@/lib/plans";
import type { PublicAuthAction } from "@/lib/publicAuthAction";

const free = PLAN_ENTITLEMENTS.free;
const pro = PLAN_ENTITLEMENTS.pro;
const enterprise = PLAN_ENTITLEMENTS.enterprise;

const plans = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "Evaluate enforcement against real agent traffic.",
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
    price: `$${PRO_PLAN_PRICE_CENTS / 100}`,
    cadence: "per month",
    blurb: "Enforced permissions, webhooks, and team-ready limits.",
    cta: "Start building",
    href: "/signup",
    featured: true,
    features: [
      `${formatLimit(pro.maxAgents)} agents`,
      `${formatLimit(pro.monthlyVerifications)} verifications / month`,
      `${pro.logRetentionDays}-day activity retention`,
      "Webhooks & workspace SSO controls",
      `${formatLimit(pro.maxBillableUsers)} billable seats`,
      "Email support"
    ]
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "annual",
    blurb: "Organisation-wide policy, retention, and procurement.",
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
    values: [formatLimit(free.maxAgents), formatLimit(pro.maxAgents), "Unlimited"]
  },
  {
    label: "Verifications / month",
    values: [
      formatLimit(free.monthlyVerifications),
      formatLimit(pro.monthlyVerifications),
      "Committed"
    ]
  },
  { label: "Webhooks", values: [free.webhooksEnabled, pro.webhooksEnabled, true] },
  {
    label: "Managed agent profiles",
    values: [free.managedProfilesEnabled, pro.managedProfilesEnabled, true]
  },
  {
    label: "Activity retention",
    values: [
      `${free.logRetentionDays} days`,
      `${pro.logRetentionDays} days`,
      "Custom / up to 13 months"
    ]
  },
  {
    label: "Workspace Google SSO controls",
    values: [free.googleWorkspaceSsoEnabled, pro.googleWorkspaceSsoEnabled, true]
  },
  {
    label: "Advanced audit exports",
    values: [
      free.advancedAuditExportsEnabled,
      pro.advancedAuditExportsEnabled,
      enterprise.advancedAuditExportsEnabled
    ]
  },
  { label: "Support", values: ["Community", "Email", "Named engagement"] }
];

const faqs = [
  {
    q: "What counts as a verification?",
    a: "One evaluated decision — allowed, denied, approval required, or error. Cached repeat decisions within a short window are not double-counted toward quota where the platform coalesces them."
  },
  {
    q: "What happens when I exceed my included volume?",
    a: "Verification evaluation continues; enforcement does not degrade because of billing. Usage and plan limits are visible in the dashboard. Contact us if you need a higher committed volume."
  },
  {
    q: "Do you charge per agent or per seat?",
    a: "Plans include an agent allowance and a billable seat limit derived from your workspace plan. Enterprise has no practical agent or seat cap under contract."
  },
  {
    q: "Is Team or Business available at checkout?",
    a: "Internal Team and Business entitlement tiers exist in the product model. Public self-serve checkout currently emphasizes Free and Pro; Enterprise is available via contact."
  }
];

export function PricingPage({
  authAction,
  googleEnabled
}: {
  authAction: PublicAuthAction;
  googleEnabled: boolean;
}) {
  return (
    <MarketingLayout authAction={authAction} googleEnabled={googleEnabled}>
      <Section>
        <SectionHeading
          eyebrow="Pricing"
          title="Pay for decisions, not seats"
          description="Limits below come from current production entitlements. Higher tiers add volume, retention, and organisational controls — the policy engine is the same."
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col rounded-xl border bg-surface p-6",
                plan.featured && "border-primary/50 shadow-raised"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{plan.name}</h3>
                {plan.featured ? (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 ds-text-11 font-medium text-primary">
                    Self-serve
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="num text-3xl font-semibold">{plan.price}</span>
                <span className="text-xs text-muted-foreground">{plan.cadence}</span>
              </div>
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
      </Section>

      <Section className="bg-surface-2">
        <SectionHeading title="Compare plans" />
        <div className="mt-8 grid gap-3 sm:hidden">
          {matrix.map((row) => (
            <div key={row.label} className="rounded-lg bg-surface p-4">
              <div className="ds-text-13 font-medium">{row.label}</div>
              <dl className="mt-3 grid grid-cols-3 gap-3">
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
        <div className="mt-8 hidden overflow-x-auto rounded-lg border bg-surface sm:block">
          <table className="w-full ds-min-w-640 text-sm">
            <caption className="sr-only">Feature comparison across Free, Pro and Enterprise plans</caption>
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
