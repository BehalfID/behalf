import type { HTMLAttributes, ReactNode } from "react";

export type DashboardStateKind =
  | "loading"
  | "empty"
  | "error"
  | "access-denied"
  | "no-workspace"
  | "no-data"
  | "offline";

const DEFAULT_STATE_COPY: Record<DashboardStateKind, { title: string; description: string }> = {
  loading: {
    title: "Loading workspace",
    description: "Retrieving the latest workspace state."
  },
  empty: {
    title: "Nothing here yet",
    description: "This area will update when workspace activity begins."
  },
  error: {
    title: "This view could not be loaded",
    description: "Try again. If the issue continues, return to the workspace overview."
  },
  "access-denied": {
    title: "Access restricted",
    description: "Your workspace role does not include access to this area."
  },
  "no-workspace": {
    title: "No workspace available",
    description: "Create or join a workspace to use the control plane."
  },
  "no-data": {
    title: "No data available",
    description: "There is no workspace data to display for this view."
  },
  offline: {
    title: "Connection unavailable",
    description: "Check your connection and try loading this view again."
  }
};

function StateMark({ kind }: { kind: DashboardStateKind }) {
  if (kind === "loading") {
    return <span className="ui-spinner ui-spinner--large" aria-hidden="true" />;
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {kind === "error" || kind === "offline" ? (
        <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17h.01" /></>
      ) : kind === "access-denied" ? (
        <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>
      ) : kind === "no-workspace" ? (
        <><path d="M4 20V7l8-4 8 4v13" /><path d="M8 20v-5h8v5M8 9h.01M12 9h.01M16 9h.01" /></>
      ) : (
        <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></>
      )}
    </svg>
  );
}

export function DashboardState({
  action,
  className,
  description,
  kind,
  title,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  action?: ReactNode;
  description?: ReactNode;
  kind: DashboardStateKind;
  title?: ReactNode;
}) {
  const copy = DEFAULT_STATE_COPY[kind];
  const role = kind === "error" || kind === "offline" ? "alert" : "status";
  return (
    <div
      aria-busy={kind === "loading" ? true : undefined}
      className={["dashboard-state", `dashboard-state--${kind}`, className].filter(Boolean).join(" ")}
      role={role}
      {...props}
    >
      <span className="dashboard-state__mark"><StateMark kind={kind} /></span>
      <div className="dashboard-state__copy">
        <h2>{title ?? copy.title}</h2>
        <p>{description ?? copy.description}</p>
      </div>
      {action ? <div className="dashboard-state__action">{action}</div> : null}
    </div>
  );
}
