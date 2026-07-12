"use client";

import { useCallback, useState, type FormEvent } from "react";
import { DashboardShellLayout } from "@/components/layout/DashboardShell";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import {
  CountedUsageLimitTile,
  InfoUsageLimitTile,
  WebhookUsageLimitTile
} from "@/components/usage/UsageLimitTile";
import type { Plan } from "@/lib/plans";
import { getPlanEntitlements, PRO_PLAN_PRICE_CENTS } from "@/lib/plans";
import {
  formatUsageCount,
  getCountedUsageHelper,
  getOverLimitNote,
  getUsageLimitState,
  getUsageStatusLabel
} from "@/lib/usageDisplay";
import { resolveDashboardFetchPath } from "@/lib/workspaceClient";
import { useOptionalWorkspace } from "@/components/workspace/WorkspaceProvider";

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
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entitlements = getPlanEntitlements(plan);
  const resetDate = nextResetDate(verificationPeriodStart);

  const handleCheckout = useCallback(async () => {
    setLoading("checkout");
    setError(null);
    try {
      const res = await fetch(resolveDashboardFetchPath("/api/billing/checkout"), { method: "POST" });
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
  }, []);

  const handlePortal = useCallback(async () => {
    setLoading("portal");
    setError(null);
    try {
      const res = await fetch(resolveDashboardFetchPath("/api/billing/portal"), { method: "POST" });
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
  }, []);

  const content = (
    <>
      <PageHeader
        eyebrow="Developer portal"
        title="Billing"
        description="Manage your plan and usage."
        className="dashboard-header"
      />

      {stripeSubscriptionStatus === "past_due" && (
        <div className="billing-alert" role="alert">
          Payment failed. Paid limits and webhook delivery are disabled until billing is updated.
        </div>
      )}

      {stripeSubscriptionStatus === "trialing" && stripeTrialEnd && (
        <div className="billing-alert" role="status">
          Free trial active — ends {formatDate(stripeTrialEnd)} ({trialDaysLeft(stripeTrialEnd)} {trialDaysLeft(stripeTrialEnd) === 1 ? "day" : "days"} left).
          {" "}Cancel via <strong>Manage subscription</strong> before then and you won't be charged.
        </div>
      )}

      {error && (
        <div className="billing-alert" role="alert">
          {error}
        </div>
      )}

      <div className="billing-grid">
        <Card>
          <div className="billing-plan-header">
            <div>
              <h2 className="billing-plan-title">Current plan</h2>
              <Badge className={plan !== "free" ? "ui-badge--success" : undefined}>
                {plan.charAt(0).toUpperCase() + plan.slice(1)}
              </Badge>
            </div>
            <div className="billing-plan-actions">
              {plan === "free" ? (
                <Button
                  variant="primary"
                  onClick={handleCheckout}
                  disabled={loading !== null}
                >
                  {loading === "checkout" ? "Redirecting…" : "Start free trial"}
                </Button>
              ) : (
                <div>
                  <Button
                    variant="secondary"
                    onClick={handlePortal}
                    disabled={loading !== null}
                  >
                    {loading === "portal" ? "Redirecting…" : "Manage subscription"}
                  </Button>
                  {stripeSubscriptionStatus === "trialing" && stripeTrialEnd && (
                    <p className="billing-trial-note">Cancel before {formatDate(stripeTrialEnd)} — no charge.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {plan === "free" && (
            <>
              <p className="billing-pro-price">
                <strong>${(PRO_PLAN_PRICE_CENTS / 100).toFixed(0)}</strong>
                <span className="billing-pro-price-period">/month</span>
              </p>
              <ul className="billing-pro-features">
                <li>Up to 50 agents (free: 3)</li>
                <li>250,000 verifications/month (free: 10,000)</li>
                <li>Webhook delivery</li>
                <li>90-day log retention (free: 7 days)</li>
              </ul>
              <p className="billing-trial-note">7-day free trial. Cancel any time before it ends — no charge.</p>
            </>
          )}
          {plan !== "free" && (
            <p className="billing-pro-price">
              <strong>${(PRO_PLAN_PRICE_CENTS / 100).toFixed(0)}</strong>
              <span className="billing-pro-price-period">/month</span>
            </p>
          )}
        </Card>

        <Card>
          <h2 className="billing-usage-title">Usage this month</h2>
          <div className="billing-usage-list">
            <UsageBar
              used={agentCount}
              limit={entitlements.maxAgents}
              label="Agents"
            />
            <UsageBar
              used={verificationCount}
              limit={entitlements.monthlyVerifications}
              label="Verifications"
            />
          </div>
        </Card>
      </div>

      <EnterpriseSection />

      <section className="dashboard-panel billing-limit-grid">
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
            label="Next billing date"
            value={formatDate(stripeCurrentPeriodEnd)}
            helper="Your subscription renews on this date."
          />
        ) : null}
      </section>
    </>
  );

  const wrapShell = !embedded && !workspace;
  if (wrapShell) {
    return <DashboardShellLayout>{content}</DashboardShellLayout>;
  }
  return content;
}

function EnterpriseSection() {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(resolveDashboardFetchPath("/api/billing/enterprise-inquiry"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  }, [form]);

  return (
    <section className="billing-enterprise">
      <div className="billing-enterprise-info">
        <h2 className="billing-enterprise-title">Enterprise</h2>
        <p className="billing-enterprise-desc">Need unlimited agents, custom SLAs, dedicated support, or SSO? Talk to us about an enterprise plan tailored to your team.</p>
        <ul className="billing-pro-features billing-enterprise-features">
          <li>Unlimited agents and verifications</li>
          <li>Custom SLA and uptime guarantees</li>
          <li>Dedicated support and onboarding</li>
          <li>SSO / SAML integration</li>
          <li>365-day log retention</li>
          <li>Custom contracts and invoicing</li>
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
