import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type PermissionRecord = {
  permissionId: string;
  accountId: string | null;
  agentId: string;
  action: string;
  allowedActions: string[];
  blockedActions: string[];
  status: string;
  lastUsedAt: Date | null;
};

export type PermissionRepositoryContract = {
  createPermission: (input: {
    permissionId: string;
    accountId: string;
    agentId: string;
    action: string;
    allowedActions?: string[];
    blockedActions?: string[];
  }) => Promise<PermissionRecord>;
  findPermissionsMatchingAction: (agentId: string, action: string) => Promise<PermissionRecord[]>;
  touchPermissionLastUsed: (permissionId: string, lastUsedAt: Date) => Promise<unknown>;
  findPermissionsByAccountAndAgent: (
    accountId: string,
    agentId: string,
    options?: { limit?: number }
  ) => Promise<PermissionRecord[]>;
};

export type PermissionContractDeps = PermissionRepositoryContract & {
  seedAgent: (overrides?: {
    agentId?: string;
    accountId?: string;
  }) => Promise<{ agentId: string; accountId: string }>;
};

export function makePermissionRepositoryContract(
  name: string,
  factory: () => PermissionContractDeps | Promise<PermissionContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("createPermission stores a permission for an agent", async () => {
      const deps = getDeps();
      const { agentId, accountId } = await deps.seedAgent({ accountId: "acct_perm_create" });

      const permission = await deps.createPermission({
        permissionId: "perm_create",
        accountId,
        agentId,
        action: "purchase"
      });

      expect(permission.permissionId).toBe("perm_create");
      expect(permission.agentId).toBe(agentId);
      expect(permission.action).toBe("purchase");
    });

    it("findPermissionsMatchingAction matches action, allowedActions, and blockedActions", async () => {
      const deps = getDeps();
      const { agentId, accountId } = await deps.seedAgent({ accountId: "acct_perm_match" });
      await deps.createPermission({
        permissionId: "perm_direct",
        accountId,
        agentId,
        action: "send_email"
      });
      await deps.createPermission({
        permissionId: "perm_allowed",
        accountId,
        agentId,
        action: "custom",
        allowedActions: ["send_email"]
      });
      await deps.createPermission({
        permissionId: "perm_blocked",
        accountId,
        agentId,
        action: "custom",
        blockedActions: ["send_email"]
      });
      await deps.createPermission({
        permissionId: "perm_other",
        accountId,
        agentId,
        action: "purchase"
      });

      const matches = await deps.findPermissionsMatchingAction(agentId, "send_email");
      const ids = matches.map((row) => row.permissionId).sort();

      expect(ids).toEqual(["perm_allowed", "perm_blocked", "perm_direct"]);
    });

    it("touchPermissionLastUsed updates lastUsedAt", async () => {
      const deps = getDeps();
      const { agentId, accountId } = await deps.seedAgent({ accountId: "acct_perm_touch" });
      await deps.createPermission({
        permissionId: "perm_touch",
        accountId,
        agentId,
        action: "purchase"
      });
      const usedAt = new Date("2026-01-15T12:00:00.000Z");

      await deps.touchPermissionLastUsed("perm_touch", usedAt);
      const [permission] = await deps.findPermissionsByAccountAndAgent(accountId, agentId);

      expect(permission?.permissionId).toBe("perm_touch");
      expect(permission?.lastUsedAt?.toISOString()).toBe(usedAt.toISOString());
    });

    it("findPermissionsByAccountAndAgent respects limit", async () => {
      const deps = getDeps();
      const { agentId, accountId } = await deps.seedAgent({ accountId: "acct_perm_limit" });
      await deps.createPermission({
        permissionId: "perm_a",
        accountId,
        agentId,
        action: "a"
      });
      await deps.createPermission({
        permissionId: "perm_b",
        accountId,
        agentId,
        action: "b"
      });

      const limited = await deps.findPermissionsByAccountAndAgent(accountId, agentId, {
        limit: 1
      });

      expect(limited).toHaveLength(1);
    });
  });
}
