import {
  formatUsageCount,
  getCountedUsageHelper,
  getUsageLimitState,
  getUsageStatusLabel,
  getWebhookHelper,
  getWebhookValue,
  type CountedUsageResourceKind,
  usageLimitTileClassName
} from "@/lib/usageDisplay";

type CountedUsageLimitTileProps = {
  kind: CountedUsageResourceKind;
  label: string;
  used: number;
  limit: number | null | undefined;
  helper?: string;
};

type InfoUsageLimitTileProps = {
  label: string;
  value: string;
  helper: string;
  state?: "normal" | "unlimited";
};

type WebhookUsageLimitTileProps = {
  enabled: boolean;
};

export function CountedUsageLimitTile({ kind, label, used, limit, helper: helperOverride }: CountedUsageLimitTileProps) {
  const state = getUsageLimitState(used, limit);
  const statusLabel = getUsageStatusLabel(state);
  const helper = helperOverride ?? getCountedUsageHelper(kind, used, limit);

  return (
    <div className={usageLimitTileClassName(state)}>
      <span>{label}</span>
      <strong>{formatUsageCount(used, limit)}</strong>
      {statusLabel ? (
        <p className="usage-limit-status" aria-live="polite">
          {statusLabel}
        </p>
      ) : null}
      <small>{helper}</small>
    </div>
  );
}

export function InfoUsageLimitTile({ label, value, helper, state = "normal" }: InfoUsageLimitTileProps) {
  const statusLabel = getUsageStatusLabel(state);

  return (
    <div className={usageLimitTileClassName(state)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {statusLabel ? (
        <p className="usage-limit-status" aria-live="polite">
          {statusLabel}
        </p>
      ) : null}
      <small>{helper}</small>
    </div>
  );
}

export function WebhookUsageLimitTile({ enabled }: WebhookUsageLimitTileProps) {
  const state = enabled ? "normal" : "over";

  return (
    <div className={usageLimitTileClassName(state)}>
      <span>Webhooks</span>
      <strong>{getWebhookValue(enabled)}</strong>
      {!enabled ? (
        <p className="usage-limit-status" aria-live="polite">
          Not included
        </p>
      ) : null}
      <small>{getWebhookHelper(enabled)}</small>
    </div>
  );
}
