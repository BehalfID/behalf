"use client";

import { useCallback, useState } from "react";
import { DashboardShellLayout } from "@/components/layout/DashboardShell";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import type { Plan } from "@/lib/plans";
import { PLAN_QUOTAS } from "@/lib/plans";

type BillingProps = {
  plan: Plan;
  stripeSubscriptionStatus: string | null;
  agentCount: number;
  verificationCount: number;
  verificationPeriodStart: string;
};

function formatLimit(limit: number) {
  return isFinite(limit) ? limit.toLocaleString() : "Unlimited";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function nextResetDate(periodStart: string) {
  const start = new Date(periodStart);
  if (Number.isNaN(start.getTime())) return new Date();
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const isUnlimited = !isFinite(limit);
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const isNearLimit = pct >= 80;

  return (
    <div className="billing-usage-row">
      <div className="billing-usage-labels">
        <span>{label}</span>
        <span className="billing-usage-count">
          {used.toLocaleString()} {isUnlimited ? "" : `/ ${limit.toLocaleString()}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="billing-usage-track">
          <div
            className={`billing-usage-fill${isNearLimit ? " billing-usage-fill--warn" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function BillingClient({
  plan,
  stripeSubscriptionStatus,
  agentCount,
  verificationCount,
  verificationPeriodStart
}: BillingProps) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const quotas = PLAN_QUOTAS[plan];
  const resetDate = nextResetDate(verificationPeriodStart);

  const handleCheckout = useCallback(async () => {
    setLoading("checkout");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  }, []);

  const handlePortal = useCallback(async () => {
    setLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  }, []);

  return (
    <DashboardShellLayout>
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
                  {loading === "checkout" ? "Redirecting…" : "Upgrade to Pro"}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={handlePortal}
                  disabled={loading !== null}
                >
                  {loading === "portal" ? "Redirecting…" : "Manage subscription"}
                </Button>
              )}
            </div>
          </div>

          {plan === "free" && (
            <ul className="billing-pro-features">
              <li>Up to 50 agents (free: 5)</li>
              <li>250,000 verifications/month (free: 10,000)</li>
              <li>Webhook delivery</li>
              <li>90-day log retention (free: 7 days)</li>
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="billing-usage-title">Usage this month</h2>
          <div className="billing-usage-list">
            <UsageBar
              used={agentCount}
              limit={quotas.maxAgents}
              label="Agents"
            />
            <UsageBar
              used={verificationCount}
              limit={quotas.verificationsPerMonth}
              label="Verifications"
            />
          </div>
        </Card>
      </div>

      <section className="dashboard-panel billing-limit-grid">
        <div>
          <span>Agents</span>
          <strong>{agentCount.toLocaleString()} / {formatLimit(quotas.maxAgents)}</strong>
          <small>{isFinite(quotas.maxAgents) ? "New agents are blocked at this limit." : "No enforced agent limit."}</small>
        </div>
        <div>
          <span>Monthly verifications</span>
          <strong>{verificationCount.toLocaleString()} / {formatLimit(quotas.verificationsPerMonth)}</strong>
          <small>Resets {formatDate(resetDate.toISOString())}.</small>
        </div>
        <div>
          <span>Webhooks</span>
          <strong>{quotas.webhooksEnabled ? "Enabled" : "Requires Pro"}</strong>
          <small>{quotas.webhooksEnabled ? "Webhook endpoints can receive verification events." : "Existing endpoints stay disabled until the plan is upgraded."}</small>
        </div>
        <div>
          <span>Log retention</span>
          <strong>{quotas.logRetentionDays} days</strong>
          <small>Dashboard logs are filtered to this retention window.</small>
        </div>
        <div>
          <span>Billing period</span>
          <strong>{formatDate(verificationPeriodStart)}</strong>
          <small>Verification usage is tracked by UTC calendar month.</small>
        </div>
      </section>
    </DashboardShellLayout>
  );
}
