import type { HTMLAttributes, ReactNode } from "react";

type FeedbackTone = "neutral" | "success" | "warning" | "destructive";

const FEEDBACK_SYMBOL: Record<FeedbackTone, string> = {
  neutral: "i",
  success: "✓",
  warning: "!",
  destructive: "×"
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Alert({
  children,
  className,
  title,
  tone = "neutral",
  role,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  tone?: FeedbackTone;
}) {
  return (
    <div
      className={classNames(
        "ui-alert",
        tone !== "neutral" && `ui-alert--${tone}`,
        className
      )}
      role={role ?? (tone === "destructive" ? "alert" : "status")}
      {...props}
    >
      <span className="ui-alert__icon" aria-hidden="true">{FEEDBACK_SYMBOL[tone]}</span>
      <div className="ui-alert__content">
        {title ? <strong>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

export function LoadingState({
  className,
  label = "Loading",
  ...props
}: HTMLAttributes<HTMLDivElement> & { label?: string }) {
  return (
    <div
      aria-live="polite"
      aria-busy="true"
      className={classNames("ui-loading-state", className)}
      role="status"
      {...props}
    >
      <span className="ui-spinner ui-spinner--large" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      className={classNames("ui-skeleton", className)}
      {...props}
    />
  );
}
