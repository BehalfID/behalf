import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  permissionEffectiveStatus,
  permissionIsBroad,
  type PermissionManagementRecord
} from "@/components/dashboard/agents/presentation";

function permission(overrides: Partial<PermissionManagementRecord> = {}): PermissionManagementRecord {
  return {
    permissionId: "perm_test",
    action: "repo.read",
    status: "active",
    ...overrides
  };
}

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("agent and permission presentation", () => {
  it("distinguishes active, expired, and revoked records without changing stored status", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));

    expect(permissionEffectiveStatus(permission())).toBe("active");
    expect(permissionEffectiveStatus(permission({
      constraints: { expiresAt: "2026-07-15T11:59:00.000Z" }
    }))).toBe("expired");
    expect(permissionEffectiveStatus(permission({
      status: "revoked",
      constraints: { expiresAt: "2026-07-16T12:00:00.000Z" }
    }))).toBe("revoked");

    vi.useRealTimers();
  });

  it("labels only records with no stored scope constraints as broad", () => {
    expect(permissionIsBroad(permission())).toBe(true);
    expect(permissionIsBroad(permission({ allowedActions: ["read issues"] }))).toBe(false);
    expect(permissionIsBroad(permission({ constraints: { deniedCommands: ["rm -rf"] } }))).toBe(false);
  });

  it("keeps semantic tables, keyboard tabs, native confirmation, and mobile degradation in the shared layer", () => {
    const component = source("components/dashboard/agents/AgentManagement.tsx");
    const css = source("app/agents-permissions.css");

    expect(component).toContain("<Table");
    expect(component).toContain("<TableHead");
    expect(component).toContain('label="Agent detail sections"');
    expect(component).toContain('event.key === "ArrowRight"');
    expect(component).toContain("<Dialog");
    expect(component).toContain('aria-label="Copy agent ID"');
    expect(css).toContain("@media (max-width: 859px)");
    expect(css).toContain("@media (max-width: 480px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("content: attr(data-label)");
  });

  it("does not add a permission replacement mutation to the dashboard client", () => {
    const dashboard = source("app/dashboard/client.tsx");
    expect(dashboard).not.toMatch(/permissions\/.+\/replace/);
    expect(dashboard).toContain("Existing permission records are not replaced or revoked.");
  });
});
