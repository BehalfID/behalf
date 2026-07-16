"use client";

import Link from "next/link";
import {
  useRef,
  useState,
  type FieldsetHTMLAttributes,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { getRequiredRoleLabel } from "@/lib/authority";
import { classifyPermissionRisk } from "@/lib/permissionRisk";
import type { PolicyTemplate } from "@/lib/policyTemplates";
import {
  permissionEffectiveStatus,
  permissionIsBroad,
  type AgentManagementRecord,
  type PermissionManagementRecord
} from "./presentation";
import {
  Badge,
  Button,
  ButtonLink,
  Dialog,
  PageHeader,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui";

export {
  permissionEffectiveStatus,
  permissionIsBroad
} from "./presentation";
export type {
  AgentManagementRecord,
  PermissionManagementRecord
} from "./presentation";

export type AgentDetailSection = "overview" | "permissions" | "integrations" | "activity";

const AGENT_DETAIL_SECTIONS: Array<{ id: AgentDetailSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "permissions", label: "Permissions" },
  { id: "integrations", label: "Integrations" },
  { id: "activity", label: "Activity" }
];

function sentenceCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function permissionAuthorityLevel(permission: PermissionManagementRecord) {
  if (typeof permission.requiredAuthorityLevel === "number") {
    return permission.requiredAuthorityLevel;
  }
  return classifyPermissionRisk({
    action: permission.action,
    resource: permission.resource,
    scope: permission.scope,
    allowedActions: permission.allowedActions,
    blockedActions: permission.blockedActions,
    requiresApproval: permission.requiresApproval,
    template: permission.template,
    constraints: permission.constraints
      ? {
          maxAmount: permission.constraints.maxAmount,
          allowedVendors: permission.constraints.allowedVendors
        }
      : undefined
  }).requiredAuthorityLevel;
}

export function AgentStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variant = normalized === "active"
    ? "success"
    : normalized === "disabled"
      ? "neutral"
      : "warning";
  return (
    <Badge variant={variant}>
      <span className="ui-status-dot" aria-hidden="true" />
      {sentenceCase(status)}
    </Badge>
  );
}

function ConnectionStatusBadge({ status }: { status: AgentManagementRecord["connectionStatus"] }) {
  const variant = status === "connected" ? "success" : status === "disconnected" ? "destructive" : "outline";
  return (
    <Badge variant={variant}>
      <span className="ui-status-dot" aria-hidden="true" />
      {sentenceCase(status)}
    </Badge>
  );
}

export function PermissionStatusBadge({ permission }: { permission: PermissionManagementRecord }) {
  const status = permissionEffectiveStatus(permission);
  const variant = status === "active" ? "success" : status === "expired" ? "warning" : "neutral";
  return (
    <Badge variant={variant}>
      <span className="ui-status-dot" aria-hidden="true" />
      {sentenceCase(status)}
    </Badge>
  );
}

export function AgentListRow({
  agent,
  href
}: {
  agent: AgentManagementRecord;
  href: string;
}) {
  return (
    <TableRow className="agent-list-row">
      <TableCell className="agent-list-row__identity" data-label="Agent">
        <Link href={href}>{agent.name}</Link>
        <code title={agent.agentId}>{agent.agentId}</code>
      </TableCell>
      <TableCell data-label="Runtime">
        <span className="agent-list-row__primary">{sentenceCase(agent.provider)}</span>
        <span className="agent-list-row__secondary">{sentenceCase(agent.agentType)}</span>
      </TableCell>
      <TableCell data-label="Connection"><ConnectionStatusBadge status={agent.connectionStatus} /></TableCell>
      <TableCell data-label="Last activity">
        <span className="agent-list-row__primary agent-list-row__time">{formatTimestamp(agent.lastUsedAt)}</span>
      </TableCell>
      <TableCell data-label="Status"><AgentStatusBadge status={agent.status} /></TableCell>
      <TableCell className="agent-list-row__action" data-label="Action">
        <ButtonLink aria-label={`Open ${agent.name}`} href={href} size="small" variant="outline">Open</ButtonLink>
      </TableCell>
    </TableRow>
  );
}

export function AgentListTable({
  agents,
  hrefForAgent
}: {
  agents: AgentManagementRecord[];
  hrefForAgent: (agent: AgentManagementRecord) => string;
}) {
  return (
    <TableContainer className="agents-table-shell">
      <Table className="agents-table">
        <caption className="sr-only">Agent identities in the current workspace</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Runtime</TableHead>
            <TableHead>Connection</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead><span className="sr-only">Primary action</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => (
            <AgentListRow agent={agent} href={hrefForAgent(agent)} key={agent.agentId} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function AgentDetailNavigation({
  active,
  onChange
}: {
  active: AgentDetailSection;
  onChange: (section: AgentDetailSection) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % AGENT_DETAIL_SECTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + AGENT_DETAIL_SECTIONS.length) % AGENT_DETAIL_SECTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = AGENT_DETAIL_SECTIONS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const section = AGENT_DETAIL_SECTIONS[nextIndex];
    onChange(section.id);
    refs.current[nextIndex]?.focus();
  }

  return (
    <TabList className="agent-detail-navigation" label="Agent detail sections">
      {AGENT_DETAIL_SECTIONS.map((section, index) => {
        const selected = active === section.id;
        return (
          <Tab
            aria-controls={`agent-section-${section.id}`}
            id={`agent-tab-${section.id}`}
            key={section.id}
            onClick={() => onChange(section.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => { refs.current[index] = node; }}
            selected={selected}
          >
            {section.label}
          </Tab>
        );
      })}
    </TabList>
  );
}

export function AgentIdentityHeader({
  agent,
  backHref,
  onRotateKey,
  onSetStatus,
  tabs,
  workspaceLabel
}: {
  agent: AgentManagementRecord;
  backHref: string;
  onRotateKey: () => Promise<void>;
  onSetStatus: (status: "enable" | "disable") => Promise<void>;
  tabs: ReactNode;
  workspaceLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState("");

  async function copyAgentId() {
    await navigator.clipboard.writeText(agent.agentId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function rotateKey(close: () => void) {
    setRotating(true);
    setRotateError("");
    try {
      await onRotateKey();
      close();
    } catch (error) {
      setRotateError(error instanceof Error ? error.message : "Credential rotation failed.");
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="agent-identity-header">
      <PageHeader
        action={(
          <div className="agent-identity-header__actions">
            <Dialog
              description="The current API key stops working immediately. The agent ID, permissions, and approval rules do not change."
              footer={(close) => (
                <>
                  <Button disabled={rotating} onClick={close} type="button" variant="outline">Cancel</Button>
                  <Button loading={rotating} onClick={() => void rotateKey(close)} type="button" variant="destructive">
                    Rotate credential
                  </Button>
                </>
              )}
              title="Rotate agent credential"
              trigger={(open) => <Button onClick={open} type="button" variant="outline">Rotate key</Button>}
            >
              <dl className="agent-credential-confirmation">
                <div><dt>Agent</dt><dd>{agent.name}</dd></div>
                <div><dt>Agent ID</dt><dd><code>{agent.agentId}</code></dd></div>
                <div><dt>Last rotation</dt><dd>{formatTimestamp(agent.keyRotatedAt)}</dd></div>
              </dl>
              {rotateError ? <p className="form-error" role="alert">{rotateError}</p> : null}
            </Dialog>
            {agent.status === "active" ? (
              <Button aria-label={`Disable ${agent.name}`} onClick={() => void onSetStatus("disable")} type="button" variant="destructive">
                Disable agent
              </Button>
            ) : (
              <Button aria-label={`Enable ${agent.name}`} onClick={() => void onSetStatus("enable")} type="button" variant="primary">
                Enable agent
              </Button>
            )}
          </div>
        )}
        breadcrumb={(
          <>
            <Link href={backHref}>Agents</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{agent.name}</span>
          </>
        )}
        className="dashboard-header agent-identity-header__page"
        description={agent.description ?? "Identity, credentials, permission policy, integrations, and activity."}
        status={<AgentStatusBadge status={agent.status} />}
        tabs={tabs}
        title={agent.name}
      />
      <dl className="agent-identity-strip" aria-label="Agent identity summary">
        <div><dt>Runtime</dt><dd>{sentenceCase(agent.provider)} <span>· {sentenceCase(agent.agentType)}</span></dd></div>
        <div><dt>Connection</dt><dd><ConnectionStatusBadge status={agent.connectionStatus} /></dd></div>
        <div><dt>Last use</dt><dd>{formatTimestamp(agent.lastUsedAt)}</dd></div>
        <div><dt>Workspace</dt><dd>{workspaceLabel}</dd></div>
        <div className="agent-identity-strip__id">
          <dt>Agent ID</dt>
          <dd>
            <code title={agent.agentId}>{agent.agentId}</code>
            <Button aria-label="Copy agent ID" onClick={() => void copyAgentId()} size="small" type="button" variant="ghost">
              {copied ? "Copied" : "Copy"}
            </Button>
          </dd>
        </div>
      </dl>
    </div>
  );
}

type ConstraintItem = { label: string; values: string[]; tone?: "allow" | "deny" | "neutral" };

function constraintItems(permission: PermissionManagementRecord): ConstraintItem[] {
  const constraints = permission.constraints ?? {};
  return [
    permission.resource ? { label: "Resource", values: [permission.resource], tone: "neutral" as const } : null,
    permission.scope ? { label: "Scope", values: [permission.scope], tone: "neutral" as const } : null,
    permission.allowedActions?.length ? { label: "Allowed actions", values: permission.allowedActions, tone: "allow" as const } : null,
    permission.blockedActions?.length ? { label: "Blocked actions", values: permission.blockedActions, tone: "deny" as const } : null,
    constraints.allowedVendors?.length ? { label: "Allowed vendors", values: constraints.allowedVendors, tone: "allow" as const } : null,
    typeof constraints.maxAmount === "number" ? { label: "Maximum amount", values: [`$${constraints.maxAmount.toLocaleString("en-US")}`], tone: "neutral" as const } : null,
    constraints.expiresAt ? { label: "Expiration", values: [formatTimestamp(constraints.expiresAt)], tone: "neutral" as const } : null,
    constraints.allowedPaths?.length ? { label: "Allowed paths", values: constraints.allowedPaths, tone: "allow" as const } : null,
    constraints.deniedPaths?.length ? { label: "Denied paths", values: constraints.deniedPaths, tone: "deny" as const } : null,
    constraints.deniedCommands?.length ? { label: "Denied commands", values: constraints.deniedCommands, tone: "deny" as const } : null
  ].filter(Boolean) as ConstraintItem[];
}

export function PermissionConstraintList({ permission }: { permission: PermissionManagementRecord }) {
  const items = constraintItems(permission);
  if (!items.length) {
    return (
      <div className="permission-constraint-empty">
        <strong>Broad policy</strong>
        <span>No resource, action-list, vendor, amount, path, command, or expiration constraint is stored.</span>
      </div>
    );
  }
  return (
    <dl className="permission-constraint-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            {item.values.map((value) => (
              <span className={`permission-constraint permission-constraint--${item.tone ?? "neutral"}`} key={value}>{value}</span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PermissionSummary({
  permission,
  onRevoke
}: {
  permission: PermissionManagementRecord;
  onRevoke: (permissionId: string) => Promise<void>;
}) {
  const status = permissionEffectiveStatus(permission);
  const authorityLevel = permissionAuthorityLevel(permission);
  return (
    <article className={`permission-summary permission-summary--${status}`}>
      <header className="permission-summary__header">
        <div className="permission-summary__identity">
          <div className="permission-summary__title-row">
            <h3>{sentenceCase(permission.action)}</h3>
            <PermissionStatusBadge permission={permission} />
            {permission.requiresApproval ? <Badge variant="warning">Approval required</Badge> : null}
            {permissionIsBroad(permission) ? <Badge variant="destructive">Broad scope</Badge> : null}
          </div>
          <code title={permission.permissionId}>{permission.permissionId}</code>
          {permission.description ? <p>{permission.description}</p> : null}
        </div>
        <div className="permission-summary__authority">
          <span>Required authority</span>
          <strong>{getRequiredRoleLabel(authorityLevel)}</strong>
          <small>Level {authorityLevel}{permission.requiredAuthorityLevel == null ? " · derived for legacy record" : ""}</small>
        </div>
      </header>
      <PermissionConstraintList permission={permission} />
      {permission.notes ? <p className="permission-summary__notes"><strong>Policy note</strong>{permission.notes}</p> : null}
      <footer className="permission-summary__footer">
        <span>
          Created {formatTimestamp(permission.createdAt)}
          {permission.lastUsedAt ? ` · last used ${formatTimestamp(permission.lastUsedAt)}` : " · never used"}
        </span>
        {permission.status === "active" ? (
          <div className="permission-summary__revoke">
            <small>Revocation is immediate and cannot be undone on this record.</small>
            <Button
              aria-label={`Revoke ${permission.action} permission`}
              onClick={() => void onRevoke(permission.permissionId)}
              size="small"
              type="button"
              variant="destructive"
            >
              Revoke permission
            </Button>
          </div>
        ) : null}
      </footer>
    </article>
  );
}

export function PermissionFormSection({
  children,
  description,
  legend,
  ...props
}: FieldsetHTMLAttributes<HTMLFieldSetElement> & {
  children: ReactNode;
  description?: ReactNode;
  legend: ReactNode;
}) {
  return (
    <fieldset className="permission-form-section" {...props}>
      <legend>{legend}</legend>
      {description ? <p className="permission-form-section__description">{description}</p> : null}
      <div className="permission-form-section__fields">{children}</div>
    </fieldset>
  );
}

function policyTemplateAuthority(template: PolicyTemplate) {
  return template.permissions.reduce((highest, permission) => {
    const next = classifyPermissionRisk({
      action: permission.action,
      resource: permission.resource,
      allowedActions: permission.allowedActions,
      blockedActions: permission.blockedActions,
      requiresApproval: permission.requiresApproval,
      constraints: permission.constraints
    }).requiredAuthorityLevel;
    return Math.max(highest, next);
  }, 0);
}

export function PermissionTemplateCard({
  active,
  categoryLabel,
  onSelect,
  template
}: {
  active: boolean;
  categoryLabel: string;
  onSelect: () => void;
  template: PolicyTemplate;
}) {
  const authority = policyTemplateAuthority(template);
  return (
    <button
      aria-pressed={active}
      className={`permission-template-card${active ? " permission-template-card--active" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span className="permission-template-card__meta">
        <span>{categoryLabel}</span>
        <span>{template.permissions.length} {template.permissions.length === 1 ? "permission" : "permissions"}</span>
      </span>
      <strong>{template.label}</strong>
      <span className="permission-template-card__tagline">{template.tagline}</span>
      <span className="permission-template-card__constraints">
        <span>Requires {getRequiredRoleLabel(authority)}</span>
        <span>Blocks {template.blocks.slice(0, 2).join(" · ")}</span>
      </span>
    </button>
  );
}

export function AgentSectionPanel({
  active,
  children,
  section
}: {
  active: AgentDetailSection;
  children: ReactNode;
  section: AgentDetailSection;
}) {
  if (active !== section) return null;
  return (
    <div
      aria-labelledby={`agent-tab-${section}`}
      className="agent-detail-section"
      id={`agent-section-${section}`}
      role="tabpanel"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
