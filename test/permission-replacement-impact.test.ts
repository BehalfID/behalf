import { describe, expect, it } from "vitest";
import {
  assessPermissionReplacementImpact,
  permissionDocumentImpactSnapshot
} from "@/lib/permissionReplacementImpact";

describe("assessPermissionReplacementImpact", () => {
  it("flags reduced access when approval and blocks are added", () => {
    const impact = assessPermissionReplacementImpact(
      {
        action: "repo.read",
        resource: "github",
        requiresApproval: false,
        requiredAuthorityLevel: 40,
        allowedActions: ["read"],
        blockedActions: [],
        constraints: {}
      },
      {
        action: "repo.read",
        resource: "github",
        requiresApproval: true,
        allowedActions: ["read"],
        blockedActions: ["write"]
      }
    );
    expect(impact.reducesAccess).toBe(true);
    expect(impact.approvalAdded).toBe(true);
  });

  it("flags expanded access when an approval gate is removed", () => {
    const impact = assessPermissionReplacementImpact(
      permissionDocumentImpactSnapshot({
        action: "repo.read",
        resource: "github",
        requiresApproval: true,
        requiredAuthorityLevel: 40,
        allowedActions: ["read"],
        blockedActions: [],
        constraints: {},
        scope: undefined,
        template: undefined
      }),
      {
        action: "repo.read",
        resource: "github",
        requiresApproval: false,
        allowedActions: ["read", "write"]
      }
    );
    expect(impact.expandsAccess).toBe(true);
    expect(impact.approvalRemoved).toBe(true);
  });
});
