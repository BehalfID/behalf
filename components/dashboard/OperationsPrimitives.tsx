"use client";

import Link from "next/link";
import { useState, type HTMLAttributes, type ReactNode } from "react";
import { useDashboardPaths } from "@/components/workspace/WorkspaceProvider";
import { Badge, Button } from "@/components/ui";

type OperationsArea = "settings" | "billing" | "webhooks" | "site-guard";

const OPERATIONS_DESTINATIONS = [
  { area: "settings", label: "Workspace settings", subpath: "/settings" },
  { area: "billing", label: "Billing & usage", subpath: "/billing" },
  { area: "webhooks", label: "Webhooks", subpath: "/webhooks" },
  { area: "site-guard", label: "Site Guard", subpath: "/sites" }
] as const;

export function OperationsNavigation({ current }: { current: OperationsArea }) {
  const { href } = useDashboardPaths();

  return (
    <nav className="operations-nav" aria-label="Workspace administration">
      <span className="operations-nav__label">Administration</span>
      <div className="operations-nav__links">
        {OPERATIONS_DESTINATIONS.map((item) => (
          <Link
            aria-current={item.area === current ? "page" : undefined}
            href={href(`/dashboard${item.subpath}`)}
            key={item.area}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export type SettingsNavigationItem = {
  href: string;
  label: string;
  detail: string;
};

export function SettingsNavigation({ items }: { items: SettingsNavigationItem[] }) {
  return (
    <nav className="settings-navigation" aria-label="Settings sections">
      <span className="settings-navigation__label">On this page</span>
      <ol>
        {items.map((item, index) => (
          <li key={item.href}>
            <a href={item.href}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SettingsSection({
  action,
  children,
  className,
  description,
  eyebrow,
  id,
  title,
  tone = "default",
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  action?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  id: string;
  title: ReactNode;
  tone?: "default" | "restricted" | "danger";
}) {
  const titleId = `${id}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className={[
        "settings-section",
        tone !== "default" ? `settings-section--${tone}` : undefined,
        className
      ].filter(Boolean).join(" ")}
      id={id}
      {...props}
    >
      <header className="settings-section__header">
        <div>
          {eyebrow ? <p className="settings-section__eyebrow">{eyebrow}</p> : null}
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="settings-section__action">{action}</div> : null}
      </header>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ENGINEERING_LEAD: "Engineering Lead",
  SENIOR_ENGINEER: "Senior Engineer",
  ENGINEER: "Engineer",
  VIEWER: "Viewer"
};

export function MemberRoleBadge({ role }: { role: string }) {
  const variant = role === "OWNER" ? "accent" : role === "ENGINEERING_LEAD" ? "warning" : "outline";
  return <Badge variant={variant}>{ROLE_LABELS[role] ?? role}</Badge>;
}

export function PlanStatusBadge({ plan, current = true }: { plan: string; current?: boolean }) {
  const name = `${plan.charAt(0).toUpperCase()}${plan.slice(1)}`;
  return (
    <Badge variant={plan === "free" ? "outline" : "accent"}>
      <span className="ui-status-dot" aria-hidden="true" />
      {name}{current ? " · current plan" : ""}
    </Badge>
  );
}

export function WebhookStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "active" ? "success" : "outline"}>
      <span className="ui-status-dot" aria-hidden="true" />
      {status === "active" ? "Active" : "Disabled"}
    </Badge>
  );
}

export function DeliveryStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "success" ? "success" : "destructive"}>
      <span className="ui-status-dot" aria-hidden="true" />
      {status === "success" ? "Delivered" : "Failed"}
    </Badge>
  );
}

export function SiteGuardStatus({ status }: { status: string }) {
  return (
    <Badge variant={status === "active" ? "success" : "destructive"}>
      <span className="ui-status-dot" aria-hidden="true" />
      {status === "active" ? "Enforcing" : "Disabled · requests denied"}
    </Badge>
  );
}

export function SecretLifecycleNotice({
  description,
  label,
  value
}: {
  description: ReactNode;
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="secret-lifecycle" role="status">
      <div className="secret-lifecycle__mark" aria-hidden="true">1×</div>
      <div className="secret-lifecycle__content">
        <strong>{label}</strong>
        <p>{description}</p>
        <code>{value}</code>
      </div>
      <Button aria-label={`Copy ${label.toLowerCase()}`} onClick={copy} size="small" type="button">
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function DestructiveSettingsSection({
  action,
  consequence,
  title
}: {
  action?: ReactNode;
  consequence: ReactNode;
  title: string;
}) {
  return (
    <div className="destructive-settings">
      <div>
        <strong>{title}</strong>
        <p>{consequence}</p>
      </div>
      {action ? <div className="destructive-settings__action">{action}</div> : null}
    </div>
  );
}
