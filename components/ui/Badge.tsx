import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

function badgeClassName(variant: BadgeVariant, className?: string) {
  return [
    "ui-badge",
    variant !== "neutral" ? `ui-badge--${variant}` : undefined,
    className
  ]
    .filter(Boolean)
    .join(" ");
}

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={badgeClassName(variant, className)} {...props} />;
}

const DECISION_META = {
  allowed: { variant: "success", symbol: "✓", label: "Allowed" },
  denied: { variant: "destructive", symbol: "×", label: "Denied" },
  approval: { variant: "warning", symbol: "Ⅱ", label: "Approval required" }
} as const satisfies Record<
  string,
  { variant: BadgeVariant; symbol: string; label: string }
>;

export function DecisionBadge({
  decision,
  children,
  ...props
}: Omit<Parameters<typeof Badge>[0], "variant"> & {
  decision: keyof typeof DECISION_META;
  children?: ReactNode;
}) {
  const meta = DECISION_META[decision];
  return (
    <Badge variant={meta.variant} {...props}>
      <span className="ui-badge__symbol" aria-hidden="true">{meta.symbol}</span>
      {children ?? meta.label}
    </Badge>
  );
}

const RISK_META = {
  low: { variant: "success", label: "Low risk" },
  medium: { variant: "warning", label: "Medium risk" },
  high: { variant: "destructive", label: "High risk" }
} as const satisfies Record<string, { variant: BadgeVariant; label: string }>;

export function RiskIndicator({
  risk,
  ...props
}: Omit<Parameters<typeof Badge>[0], "variant" | "children"> & {
  risk: keyof typeof RISK_META;
}) {
  const meta = RISK_META[risk];
  return (
    <Badge variant={meta.variant} {...props}>
      <span className="ui-status-dot" aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

type StatusMeta = { variant: BadgeVariant; label: string };

const AGENT_STATUS = {
  active: { variant: "success", label: "Agent active" },
  paused: { variant: "warning", label: "Agent paused" },
  disabled: { variant: "neutral", label: "Agent disabled" }
} as const satisfies Record<string, StatusMeta>;

const INTEGRATION_STATUS = {
  connected: { variant: "success", label: "Integration connected" },
  pending: { variant: "warning", label: "Integration pending" },
  disconnected: { variant: "neutral", label: "Integration disconnected" }
} as const satisfies Record<string, StatusMeta>;

const PLAN_STATUS = {
  free: { variant: "outline", label: "Free plan" },
  pro: { variant: "accent", label: "Pro plan" },
  business: { variant: "accent", label: "Business plan" },
  enterprise: { variant: "neutral", label: "Enterprise plan" }
} as const satisfies Record<string, StatusMeta>;

function StatusBadge({ meta, ...props }: Omit<Parameters<typeof Badge>[0], "variant"> & { meta: StatusMeta }) {
  return (
    <Badge variant={meta.variant} {...props}>
      <span className="ui-status-dot" aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

export function AgentStatus({
  status,
  ...props
}: Omit<Parameters<typeof Badge>[0], "variant" | "children"> & {
  status: keyof typeof AGENT_STATUS;
}) {
  return <StatusBadge meta={AGENT_STATUS[status]} {...props} />;
}

export function IntegrationStatus({
  status,
  ...props
}: Omit<Parameters<typeof Badge>[0], "variant" | "children"> & {
  status: keyof typeof INTEGRATION_STATUS;
}) {
  return <StatusBadge meta={INTEGRATION_STATUS[status]} {...props} />;
}

export function PlanBadge({
  plan,
  ...props
}: Omit<Parameters<typeof Badge>[0], "variant" | "children"> & {
  plan: keyof typeof PLAN_STATUS;
}) {
  return <StatusBadge meta={PLAN_STATUS[plan]} {...props} />;
}
