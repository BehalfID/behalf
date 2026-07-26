import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("permission replacement UI confirmation and errors", () => {
  it("shows security impact before replace confirmation and keeps create copy distinct", () => {
    const editor = source("components/dashboard/agent-detail/PermissionEditor.tsx");
    const review = source("components/dashboard/agent-detail/PermissionReplacementReview.tsx");
    const permissions = source("components/dashboard/agent-detail/AgentPermissions.tsx");

    expect(review).toContain("PermissionReplacementImpactReview");
    expect(review).toContain("This replacement expands access");
    expect(review).toContain("assessPermissionReplacementImpact");
    expect(permissions).toContain("Edit / replace");
    expect(permissions).toContain("Resume replacement");
    expect(editor).toContain("Review and replace");
    expect(editor).toContain("Permission change failed:");
    expect(editor).toContain("Existing permission records are not replaced or revoked.");
    expect(editor).toContain("Confirming replacement revokes");
    expect(editor).toContain("Retry replacement");
  });

  it("surfaces conflict and interruption recovery affordances", () => {
    const editor = source("components/dashboard/agent-detail/PermissionEditor.tsx");
    const permissions = source("components/dashboard/agent-detail/AgentPermissions.tsx");

    expect(permissions).toContain("resumeInterruptedReplacement");
    expect(permissions).toContain("idempotencyKey: permission.replacementIdempotencyKey");
    expect(editor).toContain("expectedUpdatedAt: initialPermission.updatedAt");
    expect(editor).toContain("idempotencyKey: replacementIdempotencyKey");
    expect(editor).toContain("useState(() => createReplacementIdempotencyKey())");
    expect(editor).toContain('result.status !== "active"');
  });
});
