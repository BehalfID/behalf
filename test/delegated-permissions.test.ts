import { describe, expect, it } from "vitest";
import {
  AUTHORITY_LEVELS,
  getRequiredRoleLabel,
  type WorkspaceRole
} from "@/lib/authority";
import {
  AGENT_PERMISSION_DENIED_MESSAGE,
  canApproveRequest,
  canCreatePermission,
  canDelegateRole,
  canDenyRequest,
  canRevokePermission,
  getEffectiveRequiredAuthority
} from "@/lib/delegatedAuth";
import { classifyPermissionRisk } from "@/lib/permissionRisk";
import {
  canRemoveMember,
  canUpdateMemberRole,
  countOwners
} from "@/lib/membershipManagement";
import { deriveProfileAuthority } from "@/lib/permissionProfiles";

describe("permission risk classification", () => {
  it("classifies safe engineer actions at ENGINEER level", () => {
    expect(classifyPermissionRisk({ action: "repo.read" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.ENGINEER
    );
    expect(classifyPermissionRisk({ action: "github.issue.read" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.ENGINEER
    );
    expect(classifyPermissionRisk({ action: "github.pr.comment" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.ENGINEER
    );
  });

  it("classifies staging/dev/preview deploy at SENIOR_ENGINEER level", () => {
    expect(classifyPermissionRisk({ action: "deploy", resource: "staging" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.SENIOR_ENGINEER
    );
    expect(classifyPermissionRisk({ action: "deploy", resource: "dev" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.SENIOR_ENGINEER
    );
    expect(classifyPermissionRisk({ action: "deploy", resource: "preview" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.SENIOR_ENGINEER
    );
  });

  it("classifies production deploy and protected branch pushes at ENGINEERING_LEAD", () => {
    expect(classifyPermissionRisk({ action: "deploy_production", resource: "production" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.ENGINEERING_LEAD
    );
    expect(classifyPermissionRisk({ action: "github.push.main" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.ENGINEERING_LEAD
    );
    expect(classifyPermissionRisk({ action: "deploy", resource: "production" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.ENGINEERING_LEAD
    );
    expect(classifyPermissionRisk({ action: "database.migrate.production" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.ENGINEERING_LEAD
    );
  });

  it("classifies secrets, billing, and destructive DB actions at ENGINEERING_LEAD", () => {
    expect(classifyPermissionRisk({ action: "secrets.write" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.ENGINEERING_LEAD
    );
    expect(classifyPermissionRisk({ action: "billing.vendor_api" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.ENGINEERING_LEAD
    );
    expect(
      classifyPermissionRisk({ action: "execute_command", allowedActions: ["drop database"] }).requiredAuthorityLevel
    ).toBe(AUTHORITY_LEVELS.ENGINEERING_LEAD);
  });

  it("classifies dependency update as SENIOR_ENGINEER unless production-impacting", () => {
    expect(classifyPermissionRisk({ action: "dependency.update", resource: "staging" }).requiredAuthorityLevel).toBe(
      AUTHORITY_LEVELS.SENIOR_ENGINEER
    );
    expect(
      classifyPermissionRisk({ action: "dependency.update", resource: "production" }).requiredAuthorityLevel
    ).toBe(AUTHORITY_LEVELS.ENGINEERING_LEAD);
  });

  it("defaults unclassified custom actions to ENGINEERING_LEAD", () => {
    const result = classifyPermissionRisk({ action: "totally_custom_unknown_action" });
    expect(result.requiredAuthorityLevel).toBe(AUTHORITY_LEVELS.ENGINEERING_LEAD);
    expect(result.classified).toBe(false);
  });
});

describe("delegated permission authorization", () => {
  const actor = (role: WorkspaceRole, userId = "user_test") => ({
    userId,
    accountId: "acct_test",
    role,
    authorityLevel: AUTHORITY_LEVELS[role]
  });

  it("allows OWNER to grant all classified permissions", () => {
    const owner = actor("OWNER");
    expect(canCreatePermission(owner, { action: "deploy_production", resource: "production" })).toBe(true);
    expect(canCreatePermission(owner, { action: "repo.read" })).toBe(true);
  });

  it("blocks ENGINEER from high-risk grants", () => {
    const engineer = actor("ENGINEER");
    expect(canCreatePermission(engineer, { action: "deploy_production", resource: "production" })).toBe(false);
    expect(canCreatePermission(engineer, { action: "secrets.write" })).toBe(false);
    expect(canCreatePermission(engineer, { action: "billing.vendor_api" })).toBe(false);
    expect(canCreatePermission(engineer, { action: "database.migrate.production" })).toBe(false);
  });

  it("allows ENGINEER to grant safe GitHub permissions", () => {
    const engineer = actor("ENGINEER");
    expect(canCreatePermission(engineer, { action: "github.issue.read" })).toBe(true);
    expect(canCreatePermission(engineer, { action: "github.pr.comment" })).toBe(true);
  });

  it("blocks VIEWER from creating permissions", () => {
    expect(canCreatePermission(actor("VIEWER"), { action: "repo.read" })).toBe(false);
  });

  it("uses runtime derivation for old permissions without stored authority", () => {
    expect(getEffectiveRequiredAuthority({ action: "repo.read" })).toBe(AUTHORITY_LEVELS.ENGINEER);
    expect(getEffectiveRequiredAuthority({ action: "deploy_production", resource: "production" })).toBe(
      AUTHORITY_LEVELS.ENGINEERING_LEAD
    );
  });

  it("uses stored requiredAuthorityLevel when present", () => {
    const engineer = actor("ENGINEER");
    const permission = { action: "repo.read", requiredAuthorityLevel: AUTHORITY_LEVELS.ENGINEERING_LEAD };
    expect(getEffectiveRequiredAuthority(permission)).toBe(AUTHORITY_LEVELS.ENGINEERING_LEAD);
    expect(canRevokePermission(engineer, permission)).toBe(false);
  });
});

describe("approval deny authority", () => {
  const actor = (role: WorkspaceRole) => ({
    userId: "user_test",
    accountId: "acct_test",
    role,
    authorityLevel: AUTHORITY_LEVELS[role]
  });

  const leadApproval = {
    requiredAuthorityLevel: AUTHORITY_LEVELS.ENGINEERING_LEAD,
    action: "deploy_production",
    vendor: "vercel.com",
    developerUserId: "owner_user"
  };

  it("blocks ENGINEER from denying ENGINEERING_LEAD requests", () => {
    expect(canDenyRequest(actor("ENGINEER"), leadApproval)).toBe(false);
  });

  it("allows ENGINEERING_LEAD to deny ENGINEERING_LEAD requests", () => {
    expect(canDenyRequest(actor("ENGINEERING_LEAD"), leadApproval)).toBe(true);
  });

  it("allows OWNER to deny any request", () => {
    expect(canDenyRequest(actor("OWNER"), leadApproval)).toBe(true);
  });

  it("blocks VIEWER from denying", () => {
    expect(canDenyRequest(actor("VIEWER"), leadApproval)).toBe(false);
  });

  it("blocks ENGINEER from approving ENGINEERING_LEAD requests", () => {
    expect(canApproveRequest(actor("ENGINEER"), leadApproval)).toBe(false);
    expect(getRequiredRoleLabel(AUTHORITY_LEVELS.ENGINEERING_LEAD)).toBe("Engineering Lead");
  });
});

describe("role delegation rules", () => {
  const actor = (role: WorkspaceRole, userId = "user_test") => ({
    userId,
    accountId: "acct_test",
    role,
    authorityLevel: AUTHORITY_LEVELS[role]
  });

  it("allows OWNER to assign ENGINEERING_LEAD", () => {
    expect(canDelegateRole(actor("OWNER"), "ENGINEERING_LEAD")).toBe(true);
  });

  it("blocks ENGINEERING_LEAD from assigning OWNER", () => {
    expect(canDelegateRole(actor("ENGINEERING_LEAD"), "OWNER")).toBe(false);
  });

  it("blocks assigning equal or higher roles", () => {
    expect(canDelegateRole(actor("ENGINEERING_LEAD"), "ENGINEERING_LEAD")).toBe(false);
    expect(canDelegateRole(actor("SENIOR_ENGINEER"), "ENGINEERING_LEAD")).toBe(false);
  });

  it("prevents removing the last OWNER", () => {
    const memberships = [{ role: "OWNER", userId: "owner" }];
    expect(canRemoveMember(actor("OWNER"), { role: "OWNER", userId: "owner" }, memberships)).toBe(false);
    expect(countOwners(memberships)).toBe(1);
  });

  it("prevents demoting the last OWNER via role update", () => {
    const memberships = [{ role: "OWNER", userId: "owner", membershipId: "mbr_owner" }];
    expect(
      canUpdateMemberRole(
        actor("OWNER", "owner"),
        { role: "OWNER", userId: "owner", membershipId: "mbr_owner" },
        "ENGINEERING_LEAD",
        memberships
      )
    ).toBe(false);
  });
});

describe("agent permission API enforcement", () => {
  it("exports the required agent denial message", async () => {
    const { agentCannotGrantPermissions } = await import("@/lib/delegatedAuth");
    const response = agentCannotGrantPermissions();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe(AGENT_PERMISSION_DENIED_MESSAGE);
  });
});
