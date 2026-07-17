import { Badge, type BadgeVariant } from "@/components/ui";

export type EnforcementMode = "unmanaged" | "managed" | "required";
export type ConnectionState = "manual" | "connected" | "disconnected";
export type ProtectedRepositoryState =
  | "protected"
  | "configured-disabled"
  | "policy-disabled"
  | "unconfigured";

const ENFORCEMENT_MODE_META: Record<
  EnforcementMode,
  { label: string; variant: BadgeVariant }
> = {
  unmanaged: { label: "Unmanaged", variant: "outline" },
  managed: { label: "Managed", variant: "accent" },
  required: { label: "Required", variant: "warning" },
};

const CONNECTION_STATE_META: Record<
  ConnectionState,
  { label: string; variant: BadgeVariant }
> = {
  manual: { label: "Manual setup", variant: "outline" },
  connected: { label: "Connected", variant: "success" },
  disconnected: { label: "Disconnected", variant: "destructive" },
};

const REPOSITORY_STATE_META: Record<
  ProtectedRepositoryState,
  { label: string; variant: BadgeVariant }
> = {
  protected: { label: "Protected", variant: "success" },
  "configured-disabled": { label: "Configured, disabled", variant: "neutral" },
  "policy-disabled": { label: "Policy disabled", variant: "neutral" },
  unconfigured: { label: "Not configured", variant: "outline" },
};

function OperationalBadge({
  label,
  variant,
}: {
  label: string;
  variant: BadgeVariant;
}) {
  return (
    <Badge variant={variant}>
      <span className="ui-status-dot" aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function EnforcementModeBadge({ mode }: { mode: EnforcementMode }) {
  return <OperationalBadge {...ENFORCEMENT_MODE_META[mode]} />;
}

export function ProfileStatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <OperationalBadge
      label={enabled ? "Policy active" : "Policy disabled"}
      variant={enabled ? "success" : "neutral"}
    />
  );
}

export function ConnectionStatusBadge({ status }: { status: ConnectionState }) {
  return <OperationalBadge {...CONNECTION_STATE_META[status]} />;
}

export function ProtectedRepositoryStatusBadge({
  state,
}: {
  state: ProtectedRepositoryState;
}) {
  return <OperationalBadge {...REPOSITORY_STATE_META[state]} />;
}

export function IntegrationPathBadge({
  path,
}: {
  path: "action-time" | "manual" | "experimental";
}) {
  if (path === "action-time") {
    return <OperationalBadge label="Action-time verify" variant="accent" />;
  }
  if (path === "experimental") {
    return <OperationalBadge label="Experimental" variant="warning" />;
  }
  return <OperationalBadge label="Manual verification" variant="outline" />;
}
