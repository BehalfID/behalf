import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("permission replacement UI confirmation and errors", () => {
  it("shows security impact before replace confirmation and keeps create copy distinct", () => {
    const dashboard = source("app/dashboard/client.tsx");
    const component = source("components/dashboard/agents/AgentManagement.tsx");

    expect(component).toContain("PermissionReplacementImpactReview");
    expect(component).toContain("This replacement expands access");
    expect(component).toContain("Edit / replace");
    expect(component).toContain("Resume replacement");
    expect(dashboard).toContain("Review and replace");
    expect(dashboard).toContain("Permission change failed:");
    expect(dashboard).toContain("Existing permission records are not replaced or revoked.");
    expect(dashboard).toContain("Confirming replacement revokes");
  });

  it("surfaces conflict and interruption recovery affordances", () => {
    const dashboard = source("app/dashboard/client.tsx");
    expect(dashboard).toContain("resumeInterruptedReplacement");
    expect(dashboard).toContain("expectedUpdatedAt: editingPermission.updatedAt");
    expect(dashboard).toContain("idempotencyKey: replacementIdempotencyKey");
  });
});
