/**
 * Action Inbox UI labels for bound, truncated, and legacy unbound approvals.
 */
import { describe, expect, it } from "vitest";
import {
  formatApprovalTargetLabel,
  isLegacyUnboundApproval,
  type OpsApprovalRequest
} from "@/components/dashboard/opsLogTypes";

function approval(overrides: Partial<OpsApprovalRequest> = {}): OpsApprovalRequest {
  return {
    approvalId: "apr_ui",
    requestId: "req_ui",
    agentId: "agent_test",
    permissionId: "perm_test",
    action: "execute_command",
    status: "pending",
    ...overrides
  };
}

describe("Action Inbox approval target labels", () => {
  it("labels command and file path targets", () => {
    expect(formatApprovalTargetLabel("command")).toBe("Command requested");
    expect(formatApprovalTargetLabel("file_path")).toBe("File path");
  });

  it("detects legacy unbound command/file approvals", () => {
    expect(
      isLegacyUnboundApproval(
        approval({ action: "execute_command", argumentKind: null, argumentPreview: null })
      )
    ).toBe(true);
    expect(
      isLegacyUnboundApproval(
        approval({
          action: "execute_command",
          argumentKind: "command",
          argumentPreview: "npm test",
          legacyUnbound: false
        })
      )
    ).toBe(false);
    expect(
      isLegacyUnboundApproval(
        approval({ action: "purchase", argumentKind: null, argumentPreview: null })
      )
    ).toBe(false);
  });

  it("honors legacyUnbound from the API enrichment", () => {
    expect(
      isLegacyUnboundApproval(
        approval({
          action: "execute_command",
          argumentKind: "command",
          argumentPreview: "npm test",
          legacyUnbound: true
        })
      )
    ).toBe(true);
  });
});
