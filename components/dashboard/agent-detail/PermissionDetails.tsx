import { Badge } from "@/components/ui";
import { getRequiredRoleLabel } from "@/lib/authority";
import { formatAgentDate } from "./format";
import type { AgentPermission } from "./types";

export function permissionConstraintSummary(permission: AgentPermission) {
  const constraints = permission.constraints ?? {};
  const details = [
    permission.allowedActions?.length
      ? `${permission.allowedActions.length} allowed action${permission.allowedActions.length === 1 ? "" : "s"}`
      : null,
    permission.blockedActions?.length
      ? `${permission.blockedActions.length} blocked action${permission.blockedActions.length === 1 ? "" : "s"}`
      : null,
    constraints.deniedCommands?.length
      ? `${constraints.deniedCommands.length} denied command${constraints.deniedCommands.length === 1 ? "" : "s"}`
      : null,
    constraints.allowedPaths?.length
      ? `${constraints.allowedPaths.length} allowed path${constraints.allowedPaths.length === 1 ? "" : "s"}`
      : null,
    constraints.deniedPaths?.length
      ? `${constraints.deniedPaths.length} denied path${constraints.deniedPaths.length === 1 ? "" : "s"}`
      : null,
    constraints.allowedVendors?.length
      ? `${constraints.allowedVendors.length} allowed vendor${constraints.allowedVendors.length === 1 ? "" : "s"}`
      : null,
    typeof constraints.maxAmount === "number" ? `maximum $${constraints.maxAmount}` : null
  ].filter(Boolean);
  return details.length ? details.join(" · ") : "No additional constraints";
}

function DetailList({ label, values }: { label: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{values.map((value) => <code key={value}>{value}</code>)}</dd>
    </div>
  );
}

export function PermissionDetails({
  permission,
  actions
}: {
  permission: AgentPermission;
  actions?: React.ReactNode;
}) {
  const constraints = permission.constraints ?? {};
  return (
    <article className="permission-details">
      <header className="permission-details__header">
        <div>
          <div className="permission-details__title">
            <strong>{permission.action}</strong>
            <span>on</span>
            <code>{permission.resource || "any resource"}</code>
          </div>
          <p>{permissionConstraintSummary(permission)}</p>
        </div>
        <div className="permission-details__status">
          <Badge>{permission.status === "active" ? "Active" : "Revoked"}</Badge>
          {permission.requiresApproval ? <Badge>Approval required</Badge> : <Badge>No approval required</Badge>}
        </div>
      </header>

      <dl className="permission-details__grid">
        {permission.requiresApproval && permission.requiredAuthorityLevel != null ? (
          <div>
            <dt>Minimum approver</dt>
            <dd>{getRequiredRoleLabel(permission.requiredAuthorityLevel)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Expiration</dt>
          <dd>{constraints.expiresAt ? formatAgentDate(constraints.expiresAt) : "No expiration"}</dd>
        </div>
        <div>
          <dt>Last used</dt>
          <dd>{formatAgentDate(permission.lastUsedAt)}</dd>
        </div>
        {typeof constraints.maxAmount === "number" ? (
          <div>
            <dt>Amount limit</dt>
            <dd>${constraints.maxAmount}</dd>
          </div>
        ) : null}
        <DetailList label="Denied commands" values={constraints.deniedCommands} />
        <DetailList label="Allowed paths" values={constraints.allowedPaths} />
        <DetailList label="Denied paths" values={constraints.deniedPaths} />
        <DetailList label="Allowed vendors" values={constraints.allowedVendors} />
        <DetailList label="Allowed actions" values={permission.allowedActions} />
        <DetailList label="Blocked actions" values={permission.blockedActions} />
        {permission.scope ? (
          <div>
            <dt>Scope</dt>
            <dd>{permission.scope}</dd>
          </div>
        ) : null}
        {permission.notes ? (
          <div>
            <dt>Notes</dt>
            <dd>{permission.notes}</dd>
          </div>
        ) : null}
      </dl>

      <footer className="permission-details__footer">
        <div>
          <span>Permission ID</span>
          <code>{permission.permissionId}</code>
          {permission.replacesPermissionId ? (
            <small>Replaces {permission.replacesPermissionId}</small>
          ) : null}
          {permission.replacedByPermissionId ? (
            <small>Retired by {permission.replacedByPermissionId}</small>
          ) : null}
        </div>
        {actions ? <div className="form-actions">{actions}</div> : null}
      </footer>
    </article>
  );
}
