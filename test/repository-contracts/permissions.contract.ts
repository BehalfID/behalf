import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type PermissionContractRow = {
  permissionId: string;
  accountId?: string | null;
  developerUserId?: string | null;
  agentId: string;
  action: string;
  allowedActions?: string[];
  blockedActions?: string[];
  constraints?: {
    maxAmount?: number | null;
    allowedVendors?: string[];
    expiresAt?: Date | null;
  } | null;
  status: string;
  updatedBy?: string | null;
  createdAt?: Date;
};

type PermissionInput = Omit<PermissionContractRow, "status"> & {
  status?: string;
};

export type PermissionsContractDeps = {
  create: (input: PermissionInput) => Promise<PermissionContractRow>;
  findMatchingForVerify: (agentId: string, action: string) => Promise<PermissionContractRow[]>;
  find: (
    filter?: Record<string, unknown>,
    options?: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number }
  ) => Promise<PermissionContractRow[]>;
  findOne: (filter: Record<string, unknown>) => Promise<PermissionContractRow | null>;
  findOneAndUpdate: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<PermissionContractRow | null>;
  findByPermissionId: (
    permissionId: string,
    scope?: { accountId?: string; developerUserId?: string }
  ) => Promise<PermissionContractRow | null>;
  revoke: (
    permissionId: string,
    scope?: { accountId?: string; developerUserId?: string },
    updatedBy?: string
  ) => Promise<unknown>;
  findByAgentId: (
    agentId: string,
    scope?: { accountId?: string; developerUserId?: string }
  ) => Promise<PermissionContractRow[]>;
  findActiveByAgentId: (
    agentId: string,
    scope?: { accountId?: string; developerUserId?: string }
  ) => Promise<PermissionContractRow[]>;
  updateOne: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ) => Promise<unknown>;
  updateMany: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ) => Promise<unknown>;
  deleteOne: (filter: Record<string, unknown>) => Promise<unknown>;
  deleteMany: (filter: Record<string, unknown>) => Promise<unknown>;
  countDocuments: (filter?: Record<string, unknown>) => Promise<number>;
  seedTenantAgent: (accountId: string, developerUserId: string, agentId: string) => Promise<void>;
};

export function makePermissionsRepositoryContract(
  name: string,
  factory: () => PermissionsContractDeps | Promise<PermissionsContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("matches direct, allowed, and blocked actions in newest-first order", async () => {
      const deps = getDeps();
      await deps.seedTenantAgent("acct_match", "dev_match", "agent_match");
      const base = {
        accountId: "acct_match",
        developerUserId: "dev_match",
        agentId: "agent_match",
        status: "active"
      };

      await deps.create({
        ...base,
        permissionId: "perm_direct",
        action: "deploy",
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      });
      await deps.create({
        ...base,
        permissionId: "perm_allowed",
        action: "deployment",
        allowedActions: ["deploy"],
        createdAt: new Date("2026-01-02T00:00:00.000Z")
      });
      await deps.create({
        ...base,
        permissionId: "perm_blocked",
        action: "operations",
        blockedActions: ["deploy"],
        createdAt: new Date("2026-01-03T00:00:00.000Z")
      });
      await deps.create({
        ...base,
        permissionId: "perm_unrelated",
        action: "read"
      });

      const rows = await deps.findMatchingForVerify("agent_match", "deploy");
      expect(rows.map((row) => row.permissionId)).toEqual([
        "perm_blocked",
        "perm_allowed",
        "perm_direct"
      ]);
    });

    it("preserves active filtering and tenant isolation", async () => {
      const deps = getDeps();
      await deps.seedTenantAgent("acct_one", "dev_one", "agent_one");
      await deps.seedTenantAgent("acct_two", "dev_two", "agent_two");
      await deps.create({
        permissionId: "perm_active",
        accountId: "acct_one",
        developerUserId: "dev_one",
        agentId: "agent_one",
        action: "read",
        status: "active"
      });
      await deps.create({
        permissionId: "perm_revoked",
        accountId: "acct_one",
        developerUserId: "dev_one",
        agentId: "agent_one",
        action: "write",
        status: "revoked"
      });

      expect(
        (await deps.findActiveByAgentId("agent_one", { accountId: "acct_one" })).map(
          (row) => row.permissionId
        )
      ).toEqual(["perm_active"]);
      expect(
        await deps.findByPermissionId("perm_active", { accountId: "acct_two" })
      ).toBeNull();
      expect(await deps.findByAgentId("agent_one", { developerUserId: "dev_two" })).toEqual([]);
    });

    it("round-trips arrays and JSON constraints and paginates deterministically", async () => {
      const deps = getDeps();
      await deps.seedTenantAgent("acct_json", "dev_json", "agent_json");
      const expiresAt = new Date("2027-04-05T06:07:08.000Z");

      for (let index = 1; index <= 3; index += 1) {
        await deps.create({
          permissionId: `perm_json_${index}`,
          accountId: "acct_json",
          developerUserId: "dev_json",
          agentId: "agent_json",
          action: `action_${index}`,
          allowedActions: ["read", `read_${index}`],
          blockedActions: ["delete"],
          constraints: {
            maxAmount: 125.5,
            allowedVendors: ["vendor-a", "vendor-b"],
            expiresAt
          },
          createdAt: new Date(`2026-02-0${index}T00:00:00.000Z`)
        });
      }

      const page = await deps.find(
        { accountId: "acct_json", allowedActions: "read" },
        { sort: { createdAt: -1 }, skip: 1, limit: 1 }
      );
      expect(page.map((row) => row.permissionId)).toEqual(["perm_json_2"]);
      expect(page[0]?.allowedActions).toEqual(["read", "read_2"]);
      expect(page[0]?.blockedActions).toEqual(["delete"]);
      expect(page[0]?.constraints?.maxAmount).toBe(125.5);
      expect(page[0]?.constraints?.allowedVendors).toEqual(["vendor-a", "vendor-b"]);
      expect(page[0]?.constraints?.expiresAt?.getTime()).toBe(expiresAt.getTime());
    });

    it("preserves update, revoke, count, and delete return behavior", async () => {
      const deps = getDeps();
      await deps.seedTenantAgent("acct_mutate", "dev_mutate", "agent_mutate");
      await deps.create({
        permissionId: "perm_mutate",
        accountId: "acct_mutate",
        developerUserId: "dev_mutate",
        agentId: "agent_mutate",
        action: "write"
      });
      await deps.create({
        permissionId: "perm_delete",
        accountId: "acct_mutate",
        developerUserId: "dev_mutate",
        agentId: "agent_mutate",
        action: "delete"
      });

      const before = await deps.findOneAndUpdate(
        { accountId: "acct_mutate", permissionId: "perm_mutate" },
        { $set: { notes: "updated" } },
        { returnDocument: "before" }
      );
      expect(before?.permissionId).toBe("perm_mutate");

      await deps.updateOne(
        { accountId: "acct_mutate" },
        { $set: { notes: "single-update" } }
      );
      expect(
        (await deps.find({ accountId: "acct_mutate", notes: "single-update" })).length
      ).toBe(1);
      await deps.updateMany(
        { accountId: "acct_mutate" },
        { $set: { resource: "shared-update" } }
      );
      expect(
        (await deps.find({ accountId: "acct_mutate", resource: "shared-update" })).length
      ).toBe(2);

      await deps.revoke("perm_mutate", { accountId: "acct_mutate" }, "dev_reviewer");
      const revoked = await deps.findOne({ permissionId: "perm_mutate" });
      expect(revoked?.status).toBe("revoked");
      expect(revoked?.updatedBy).toBe("dev_reviewer");
      expect(await deps.countDocuments({ accountId: "acct_mutate" })).toBe(2);

      await deps.deleteOne({ accountId: "acct_mutate", permissionId: "perm_delete" });
      await deps.deleteMany({ accountId: "acct_mutate", status: "revoked" });
      expect(await deps.countDocuments({ accountId: "acct_mutate" })).toBe(0);
    });
  });
}
