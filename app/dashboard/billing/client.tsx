"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Button, Card, PageHeader } from "@/components/ui";
import {
  OperationsNavigation,
  PlanStatusBadge,
  SettingsSection
} from "@/components/dashboard/OperationsPrimitives";
import {
  CountedUsageLimitTile,
  InfoUsageLimitTile,
  WebhookUsageLimitTile
} from "@/components/usage/UsageLimitTile";
import type { Plan, SelfServePlan } from "@/lib/plans";
import {
  BUSINESS_PLAN_PRICE_CENTS,
  formatLimit,
  getPlanEntitlements,
  isSelfServePlan,
  priceCentsForPlan,
  PRO_PLAN_PRICE_CENTS,
  SELF_SERVE_PLANS,
  TEAM_PLAN_PRICE_CENTS
} from "@/lib/plans";
import {
  formatUsageCount,
  getCountedUsageHelper,
  getOverLimitNote,
  getUsageLimitState,
  getUsageStatusLabel
} from "@/lib/usageDisplay";
import { useDashboardApi } from "@/components/workspace/WorkspaceProvider";

type BillingProps = {
  /** Effective plan: the higher of the billing plan and any active grant. */
  plan: Plan;
  /** Present when a complimentary grant is what raises the plan above billing. */
  complimentary: { plan: Plan; expiresAt: string | null } | null;
  stripeSubscriptionStatus: string | null;
  stripeTrialEnd: string | null;
  stripeCurrentPeriodEnd: string | null;
  agentCount: number;
  seatCount: number;
  protectedRepoCount: number;
  verificationCount: number;
  verificationPeriodStart: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function trialDaysLeft(trialEnd: string) {
  const ms = new Date(trialEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function nextResetDate(periodStart: string) {
  const start = new Date(periodStart);
  if (Number.isNaN(start.getTime())) return new Date();
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const state = getUsageLimitState(used, limit);
  const isUnlimited = state === "unlimited";
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const statusLabel = getUsageStatusLabel(state);
  const fillClass =
    state === "over"
      ? " billing-usage-fill--over"
      : state === "near"
        ? " billing-usage-fill--warn"
        : "";

  return (
    <div className={`billing-usage-row${state !== "normal" ? ` billing-usage-row--${state}` : ""}`}>
      <div className="billing-usage-labels">
        <span>{label}</span>
        <span className="billing-usage-count">{formatUsageCount(used, limit)}</span>
      </div>
      {statusLabel ? <p className="usage-limit-status">{statusLabel}</p> : null}
      {!isUnlimited && (
        <div className="billing-usage-track">
          <div className={`billing-usage-fill${fillClass}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function BillingClient({
  plan,
  complimentary,
  stripeSubscriptionStatus,
  stripeTrialEnd,
  stripeCurrentPeriodEnd,
  agentCount,
  seatCount,
  protectedRepoCount,
  verificationCount,
  verificationPeriodStart
}: BillingProps) {
  const { fetch: dashboardFetch } = useDashboardApi();
  const [loading, setLoading] = useState<"checkout" | "portal" | SelfServePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entitlements = getPlanEntitlements(plan);
  const resetDate = nextResetDate(verificationPeriodStart);
  // A comped workspace with no subscription has nothing for the Stripe portal
  // to manage, so it must not be offered an action that would only error.
  const hasSubscription = stripeSubscriptionStatus !== null;
  const complimentaryOnly = complimentary !== null && !hasSubscription;
  const monthlyPriceLabel = isSelfServePlan(plan)
    ? `$${(priceCentsForPlan(plan) / 100).toFixed(0)}`
    : plan === "free" || complimentaryOnly
      ? "$0"
      : "Custom";

  const handleCheckout = useCallback(async (target: SelfServePlan) => {
    setLoading(target);
    setError(null);
    try {
      const res = await dashboardFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: target })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }, [dashboardFetch]);

  const handlePortal = useCallback(async () => {
    setLoading("portal");
    setError(null);
    try {
      const res = await dashboardFetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }, [dashboardFetch]);

  const content = (
    <>
      <PageHeader
        eyebrow="Workspace administration"
        title="Billing & usage"
        description="Review the current plan, enforced allowances, monthly usage, and Stripe-managed subscription actions."
        className="dashboard-header"
      />
      <OperationsNavigation current="billing" />

      {stripeSubscriptionStatus === "past_due" && (
        <div className="billing-alert" role="alert">
          Payment failed. Paid limits and webhook delivery are disabled until billing is updated.
        </div>
      )}

      {stripeSubscriptionStatus === "trialing" && stripeTrialEnd && (
        <div className="billing-alert billing-alert--info" role="status">
          Free trial active — ends {formatDate(stripeTrialEnd)} ({trialDaysLeft(stripeTrialEnd)} {trialDaysLeft(stripeTrialEnd) === 1 ? "day" : "days"} left).
          {" "}Cancel via <strong>Manage subscription</strong> before then to avoid a charge.
        </div>
      )}

      {complimentary && (
        <div className="billing-alert billing-alert--info" role="status">
          Complimentary {complimentary.plan} plan applied to this workspace
          {complimentary.expiresAt ? ` until ${formatDate(complimentary.expiresAt)}` : " — no expiry"}.
          {" "}Allowances below reflect it, and no payment is required.
        </div>
      )}

      {error && (
        <div className="billing-alert" role="alert">
          {error}
        </div>
      )}

      <div className="billing-overview billing-grid">
        <SettingsSection
          description="The plan and subscription state currently applied to this workspace."
          eyebrow="Subscription"
          id="current-plan"
          title="Current plan"
        >
          <div className="billing-plan-summary">
            <div className="billing-plan-summary__top">
              <div>
                <PlanStatusBadge plan={plan} />
                {plan === "enterprise" && !complimentaryOnly ? (
                  <p className="billing-plan-summary__price"><strong>Custom</strong><span>contract</span></p>
                ) : (
                  <p className="billing-plan-summary__price">
                    <strong>{monthlyPriceLabel}</strong>
                    <span>/ month</span>
                  </p>
                )}
              </div>
              <div className="billing-plan-actions">
                {complimentaryOnly ? (
                  <p className="billing-trial-note">
                    Complimentary plan — there is no subscription to manage.
                  </p>
                ) : plan === "free" ? (
                  <p className="billing-trial-note">
                    Choose a self-serve plan below. Pro includes a 7-day trial.
                  </p>
                ) : (
                  <div>
                    <Button variant="secondary" onClick={handlePortal} loading={loading === "portal"} disabled={loading !== null}>
                      Manage subscription
                    </Button>
                    {stripeSubscriptionStatus === "trialing" && stripeTrialEnd && (
                      <p className="billing-trial-note">Cancel before {formatDate(stripeTrialEnd)} — no charge.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <dl className="settings-summary">
              <div><dt>Subscription status</dt><dd>{stripeSubscriptionStatus ?? (complimentary ? "Complimentary — no paid subscription" : plan === "free" ? "No paid subscription" : "Not reported")}</dd></div>
              <div><dt>Monthly verification reset</dt><dd>{formatDate(resetDate.toISOString())} · UTC calendar month</dd></div>
              {stripeCurrentPeriodEnd ? <div><dt>Current Stripe period ends</dt><dd>{formatDate(stripeCurrentPeriodEnd)}</dd></div> : null}
            </dl>
          </div>
        </SettingsSection>

        <SettingsSection
          className="billing-usage-panel"
          description="Actual agent and verification counters against this plan's enforced limits."
          eyebrow="Current period"
          id="billing-usage"
          title="Usage this month"
        >
          <div className="billing-usage-list">
            <UsageBar used={agentCount} limit={entitlements.maxAgents} label="Agents" />
            <UsageBar used={verificationCount} limit={entitlements.monthlyVerifications} label="Verifications" />
          </div>
        </SettingsSection>
      </div>

      <SettingsSection
        description="All verified workspace counters and feature allowances enforced by the current plan."
        eyebrow="Entitlements"
        id="plan-allowances"
        title="Plan allowances"
      >
      <section className="dashboard-panel billing-limit-grid operations-limit-grid" aria-label="Current plan limits">
        <CountedUsageLimitTile
          kind="seats"
          label="Billable seats"
          used={seatCount}
          limit={entitlements.maxBillableUsers}
        />
        <CountedUsageLimitTile kind="agents" label="Agents" used={agentCount} limit={entitlements.maxAgents} />
        <CountedUsageLimitTile
          kind="protectedRepos"
          label="Protected repos"
          used={protectedRepoCount}
          limit={entitlements.maxProtectedRepos}
        />
        <CountedUsageLimitTile
          kind="verifications"
          label="Monthly verifications"
          used={verificationCount}
          limit={entitlements.monthlyVerifications}
          helper={
            getOverLimitNote("verifications", verificationCount, entitlements.monthlyVerifications) ??
            `Resets ${formatDate(resetDate.toISOString())}. ${getCountedUsageHelper("verifications", verificationCount, entitlements.monthlyVerifications)}`
          }
        />
        <WebhookUsageLimitTile enabled={entitlements.webhooksEnabled} />
        <InfoUsageLimitTile
          label="Log retention"
          value={`${entitlements.logRetentionDays} days`}
          helper="Dashboard logs are filtered to this retention window."
        />
        <InfoUsageLimitTile
          label="Billing period"
          value={formatDate(verificationPeriodStart)}
          helper="Verification usage is tracked by UTC calendar month."
        />
        {stripeCurrentPeriodEnd ? (
          <InfoUsageLimitTile
            label="Current period end"
            value={formatDate(stripeCurrentPeriodEnd)}
            helper="Date reported for the current Stripe subscription period."
          />
        ) : null}
      </section>
      </SettingsSection>

      {plan === "free" && !complimentaryOnly ? (
        <SettingsSection
          description="Self-serve Stripe checkout. Pro includes a 7-day trial; Team and Business bill immediately."
          eyebrow="Upgrade"
          id="plan-comparison"
          title="Choose a plan"
        >
          <dl className="billing-differences" aria-label="Self-serve plan comparison">
            {SELF_SERVE_PLANS.map((tier) => {
              const tierEntitlements = getPlanEntitlements(tier);
              const dollars = (priceCentsForPlan(tier) / 100).toFixed(0);
              return (
                <div key={tier}>
                  <dt>
                    {tier === "pro" ? "Pro" : tier === "team" ? "Team" : "Business"}{" "}
                    (${dollars}/mo)
                  </dt>
                  <dd>
                    {formatLimit(tierEntitlements.maxBillableUsers)} seats ·{" "}
                    {formatLimit(tierEntitlements.maxAgents)} agents ·{" "}
                    {formatLimit(tierEntitlements.maxProtectedRepos)} protected repos ·{" "}
                    {formatLimit(tierEntitlements.monthlyVerifications)} verifications ·{" "}
                    {tierEntitlements.logRetentionDays}-day logs
                    {tierEntitlements.advancedAuditExportsEnabled ? " · audit exports" : ""}
                    {" · "}
                    <Button
                      variant={tier === "pro" ? "primary" : "secondary"}
                      onClick={() => handleCheckout(tier)}
                      loading={loading === tier}
                      disabled={loading !== null}
                    >
                      {tier === "pro" ? "Start 7-day Pro trial" : `Upgrade to ${tier === "team" ? "Team" : "Business"}`}
                    </Button>
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="billing-trial-note">
            Free includes {formatLimit(getPlanEntitlements("free").monthlyVerifications)} verifications / month.
            Pro trial is ${(PRO_PLAN_PRICE_CENTS / 100).toFixed(0)}/mo after 7 days; Team is $
            {(TEAM_PLAN_PRICE_CENTS / 100).toFixed(0)}/mo; Business is $
            {(BUSINESS_PLAN_PRICE_CENTS / 100).toFixed(0)}/mo.
          </p>
        </SettingsSection>
      ) : null}

      <EnterpriseSection />
    </>
  );

  return content;
}

function EnterpriseSection() {
  const { fetch: dashboardFetch } = useDashboardApi();
  const enterprise = getPlanEntitlements("enterprise");
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await dashboardFetch("/api/billing/enterprise-inquiry", {
        method: "POST",
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
      setForm({ name: "", email: "", company: "", message: "" });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="billing-enterprise operations-enterprise" aria-labelledby="enterprise-plan-title">
      <div className="billing-enterprise-info">
        <p className="settings-section__eyebrow">Plan inquiry</p>
        <h2 className="billing-enterprise-title" id="enterprise-plan-title">Enterprise</h2>
        <p className="billing-enterprise-desc">Ask about the enterprise entitlement tier recorded in BehalfID. Contract, pricing, and availability details are confirmed by the team after inquiry.</p>
        <ul className="billing-pro-features billing-enterprise-features">
          <li>{formatLimit(enterprise.maxBillableUsers)} billable users</li>
          <li>{formatLimit(enterprise.maxAgents)} agents</li>
          <li>{formatLimit(enterprise.maxProtectedRepos)} protected repositories</li>
          <li>{formatLimit(enterprise.monthlyVerifications)} monthly verifications</li>
          <li>{enterprise.logRetentionDays}-day log retention</li>
          <li>Webhooks and advanced audit exports enabled</li>
        </ul>
      </div>

      <Card className="billing-enterprise-form-card">
        {success ? (
          <div className="billing-enterprise-success">
            <strong>We&apos;ll be in touch soon.</strong>
            <p>Your inquiry has been received. Our team will reach out to {form.email || "you"} within 1–2 business days.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="billing-enterprise-form">
            <h3 className="billing-enterprise-form-title">Contact sales</h3>
            {error && <p className="billing-alert" role="alert">{error}</p>}
            <label>
              <span>Name</span>
              <input
                required
                maxLength={200}
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label>
              <span>Work email</span>
              <input
                required
                type="email"
                maxLength={320}
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label>
              <span>Company</span>
              <input
                required
                maxLength={200}
                placeholder="Company name"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              />
            </label>
            <label>
              <span>How can we help? <span className="billing-optional">(optional)</span></span>
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="Tell us about your use case, team size, or any specific requirements…"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
            </label>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Get in touch"}
            </Button>
          </form>
        )}
      </Card>
    </section>
  );
}
