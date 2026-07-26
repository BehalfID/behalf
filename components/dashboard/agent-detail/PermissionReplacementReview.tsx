import { getRequiredRoleLabel } from "@/lib/authority";
import {
  assessPermissionReplacementImpact,
  permissionDocumentImpactSnapshot
} from "@/lib/permissionReplacementImpact";
import { permissionDraftAuthority } from "./permissionDrafts";
import type { AgentPermission, PermissionDraft } from "./types";

function ReviewColumn({ title, permission }: { title: string; permission: AgentPermission | PermissionDraft }) {
  const isStored = "permissionId" in permission;
  const constraints = permission.constraints ?? {};
  const requiresApproval = permission.requiresApproval === true;
  const authority = isStored
    ? permission.requiredAuthorityLevel
    : permissionDraftAuthority(permission).requiredAuthorityLevel;

  return (
    <section className="permission-replacement-review__column">
      <h3>{title}</h3>
      <dl className="permission-review-list">
        {isStored ? (
          <div><dt>Permission</dt><dd><code>{permission.permissionId}</code></dd></div>
        ) : null}
        <div><dt>Action</dt><dd>{permission.action || "Not set"}</dd></div>
        <div><dt>Resource</dt><dd>{permission.resource || "Any resource"}</dd></div>
        <div><dt>Approval</dt><dd>{requiresApproval ? "Approval required" : "No approval required"}</dd></div>
        {requiresApproval && authority != null ? (
          <div><dt>Minimum approver</dt><dd>{getRequiredRoleLabel(authority)}</dd></div>
        ) : null}
        <div><dt>Denied commands</dt><dd>{constraints.deniedCommands?.join(", ") || "None"}</dd></div>
        <div><dt>Allowed paths</dt><dd>{constraints.allowedPaths?.join(", ") || "Any path"}</dd></div>
        <div><dt>Denied paths</dt><dd>{constraints.deniedPaths?.join(", ") || "None"}</dd></div>
        <div><dt>Allowed vendors</dt><dd>{constraints.allowedVendors?.join(", ") || "Any vendor"}</dd></div>
        <div><dt>Amount limit</dt><dd>{typeof constraints.maxAmount === "number" ? `$${constraints.maxAmount}` : "None"}</dd></div>
        <div><dt>Allowed actions</dt><dd>{permission.allowedActions?.join(", ") || "None listed"}</dd></div>
        <div><dt>Blocked actions</dt><dd>{permission.blockedActions?.join(", ") || "None listed"}</dd></div>
        <div><dt>Expiration</dt><dd>{constraints.expiresAt ? new Date(constraints.expiresAt).toLocaleString() : "No expiration"}</dd></div>
      </dl>
    </section>
  );
}

export function PermissionReplacementReview({
  before,
  after
}: {
  before: AgentPermission;
  after: PermissionDraft;
}) {
  const impact = assessPermissionReplacementImpact(
    permissionDocumentImpactSnapshot({
      action: before.action,
      resource: before.resource,
      requiresApproval: before.requiresApproval,
      requiredAuthorityLevel: before.requiredAuthorityLevel,
      allowedActions: before.allowedActions,
      blockedActions: before.blockedActions,
      constraints: before.constraints
        ? {
            maxAmount: before.constraints.maxAmount,
            allowedVendors: before.constraints.allowedVendors,
            expiresAt: before.constraints.expiresAt,
            allowedPaths: before.constraints.allowedPaths,
            deniedPaths: before.constraints.deniedPaths,
            deniedCommands: before.constraints.deniedCommands
          }
        : undefined,
      scope: before.scope,
      template: before.template
    }),
    {
      action: after.action,
      resource: after.resource,
      requiresApproval: after.requiresApproval,
      allowedActions: after.allowedActions,
      blockedActions: after.blockedActions,
      template: after.template,
      constraints: {
        maxAmount: after.constraints.maxAmount,
        allowedVendors: after.constraints.allowedVendors
      }
    }
  );

  return (
    <div className="permission-replacement-review" role="region" aria-label="Replacement security impact">
      <div className="permission-replacement-review__summary">
        <strong>
          {impact.expandsAccess
            ? "This replacement expands access"
            : impact.reducesAccess
              ? "This replacement reduces access"
              : "This replacement changes the active policy"}
        </strong>
        <p>
          The current permission will be revoked before the replacement becomes active. Creating a new
          permission is a separate action and does not modify this record.
        </p>
        <ul>
          {impact.changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      </div>
      <div className="permission-replacement-review__columns">
        <ReviewColumn title="Before · will be retired" permission={before} />
        <ReviewColumn title="After · will become active" permission={after} />
      </div>
    </div>
  );
}

/** Alias kept for source-inspection parity with the shared impact-review wording. */
export const PermissionReplacementImpactReview = PermissionReplacementReview;
