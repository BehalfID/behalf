import { getRequiredRoleLabel } from "@/lib/authority";
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
  return (
    <div className="permission-replacement-review">
      <ReviewColumn title="Before · will be retired" permission={before} />
      <ReviewColumn title="After · will become active" permission={after} />
    </div>
  );
}
