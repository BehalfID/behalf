"use client";

import { useCallback, useState, type FormEvent } from "react";
import { DashboardShellLayout } from "@/components/layout/DashboardShell";
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
import type { Plan } from "@/lib/plans";
import { formatLimit, getPlanEntitlements, PRO_PLAN_PRICE_CENTS } from "@/lib/plans";
import {
  formatUsageCount,
  getCountedUsageHelper,
  getOverLimitNote,
  getUsageLimitState,
  getUsageStatusLabel
} from "@/lib/usageDisplay";
import { useDashboardApi, useOptionalWorkspace } from "@/components/workspace/WorkspaceProvider";

type BillingProps = {
  plan: Plan;
  stripeSubscriptionStatus: string | null;
  stripeTrialEnd: string | null;
  stripeCurrentPeriodEnd: string | null;
  agentCount: number;
  seatCount: number;
  protectedRepoCount: number;
  verificationCount: number;
  verificationPeriodStart: string;
  /** When true, skip the outer dashboard shell (already provided by workspace layout). */
  embedded?: boolean;
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
  stripeSubscriptionStatus,
  stripeTrialEnd,
  stripeCurrentPeriodEnd,
  agentCount,
  seatCount,
  protectedRepoCount,
  verificationCount,
  verificationPeriodStart,
  embedded = false
}: BillingProps) {
  const workspace = useOptionalWorkspace();
  const { fetch: dashboardFetch } = useDashboardApi();
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entitlements = getPlanEntitlements(plan);
  const proEntitlements = getPlanEntitlements("pro");
  const resetDate = nextResetDate(verificationPeriodStart);

  const handleCheckout = useCallback(async () => {
    setLoading("checkout");
    setError(null);
    try {
      const res = await dashboardFetch("/api/billing/checkout", { method: "POST" });
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
                {plan === "free" || plan === "pro" ? (
                  <p className="billing-plan-summary__price">
                    <strong>{plan === "free" ? "$0" : `$${(PRO_PLAN_PRICE_CENTS / 100).toFixed(0)}`}</strong>
                    <span>/ month</span>
                  </p>
                ) : (
                  <p className="billing-plan-summary__price"><strong>Managed</strong><span>plan</span></p>
                )}
              </div>
              <div className="billing-plan-actions">
                {plan === "free" ? (
                  <Button variant="primary" onClick={handleCheckout} loading={loading === "checkout"} disabled={loading !== null}>
                    Start 7-day Pro trial
                  </Button>
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
              <div><dt>Subscription status</dt><dd>{stripeSubscriptionStatus ?? (plan === "free" ? "No paid subscription" : "Not reported")}</dd></div>
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

      {(plan === "free" || plan === "pro") ? (
        <SettingsSection
          description="Only verified differences between the Free plan and the Stripe-billed Pro plan are shown."
          eyebrow="Plan comparison"
          id="plan-comparison"
          title="Free and Pro"
        >
          <dl className="billing-differences" aria-label="Free and Pro plan comparison">
            <div><dt>Free</dt><dd>1 billable seat · 3 agents · 1 protected repo · 10,000 verifications · 7-day logs · no webhooks</dd></div>
            <div><dt>Pro</dt><dd>{formatLimit(proEntitlements.maxBillableUsers)} billable seats · {formatLimit(proEntitlements.maxAgents)} agents · {formatLimit(proEntitlements.maxProtectedRepos)} protected repos · {formatLimit(proEntitlements.monthlyVerifications)} verifications · {proEntitlements.logRetentionDays}-day logs · webhooks</dd></div>
          </dl>
          {plan === "free" ? <p className="billing-trial-note">Pro checkout starts a 7-day trial at ${(PRO_PLAN_PRICE_CENTS / 100).toFixed(0)}/month. Cancel through the billing portal before the trial ends to avoid a charge.</p> : null}
        </SettingsSection>
      ) : null}

      <EnterpriseSection />
    </>
  );

  const wrapShell = !embedded && !workspace;
  if (wrapShell) {
    return <DashboardShellLayout>{content}</DashboardShellLayout>;
  }
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
