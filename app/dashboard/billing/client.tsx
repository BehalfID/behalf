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
  verificationCount
}: BillingProps) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const quotas = PLAN_QUOTAS[plan];

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
      <PageHeader title="Billing" description="Manage your plan and usage." />

      {stripeSubscriptionStatus === "past_due" && (
        <div className="billing-alert" role="alert">
          Payment failed — your subscription is past due. Update your payment method to avoid service interruption.
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
    </DashboardShellLayout>
  );
}
