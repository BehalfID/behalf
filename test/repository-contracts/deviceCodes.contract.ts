import { expect, it } from "vitest";
import { repositoryContractSuite } from "./contractHarness";

export type DeviceCodeStatus = "pending" | "authorized" | "denied";

export type DeviceCodeContractRow = {
  codeId: string;
  deviceCode: string;
  userCode: string;
  status: DeviceCodeStatus;
  userId?: string | null;
  expiresAt: Date;
  createdAt?: Date;
};

export type DeviceCodesContractDeps = {
  createDeviceCode: (input: {
    codeId: string;
    deviceCode: string;
    userCode: string;
    status?: DeviceCodeStatus;
    expiresAt: Date;
  }) => Promise<DeviceCodeContractRow>;
  findOneDeviceCode: (filter: Record<string, unknown>) => Promise<DeviceCodeContractRow | null>;
  updateStatus: (
    userCode: string,
    status: DeviceCodeStatus,
    options?: {
      userId?: string | null;
      sessionToken?: string | null;
      expectedStatus?: DeviceCodeStatus;
    }
  ) => Promise<unknown>;
  findOneAndDeleteAuthorized: (deviceCode: string) => Promise<DeviceCodeContractRow | null>;
};

export function makeDeviceCodesRepositoryContract(
  name: string,
  factory: () => DeviceCodesContractDeps | Promise<DeviceCodesContractDeps>
) {
  repositoryContractSuite(name, factory, (getDeps) => {
    it("createDeviceCode defaults to pending status and stamps createdAt", async () => {
      const deps = getDeps();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      const created = await deps.createDeviceCode({
        codeId: "code_create",
        deviceCode: "device_create",
        userCode: "USER-CREATE",
        expiresAt
      });

      expect(created.status).toBe("pending");
      expect(created.createdAt).toBeInstanceOf(Date);
    });

    it("rejects a duplicate deviceCode", async () => {
      const deps = getDeps();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await deps.createDeviceCode({
        codeId: "code_dup_a",
        deviceCode: "device_dup_shared",
        userCode: "USER-DUP-A",
        expiresAt
      });

      await expect(
        deps.createDeviceCode({
          codeId: "code_dup_b",
          deviceCode: "device_dup_shared",
          userCode: "USER-DUP-B",
          expiresAt
        })
      ).rejects.toThrow();
    });

    it("rejects a duplicate userCode", async () => {
      const deps = getDeps();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await deps.createDeviceCode({
        codeId: "code_dup_user_a",
        deviceCode: "device_dup_user_a",
        userCode: "USER-DUP-SHARED",
        expiresAt
      });

      await expect(
        deps.createDeviceCode({
          codeId: "code_dup_user_b",
          deviceCode: "device_dup_user_b",
          userCode: "USER-DUP-SHARED",
          expiresAt
        })
      ).rejects.toThrow();
    });

    it("findOneDeviceCode filters by userCode and status", async () => {
      const deps = getDeps();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await deps.createDeviceCode({
        codeId: "code_filter",
        deviceCode: "device_filter",
        userCode: "USER-FILTER",
        expiresAt
      });

      const pendingMatch = await deps.findOneDeviceCode({
        userCode: "USER-FILTER",
        status: "pending"
      });
      expect(pendingMatch?.codeId).toBe("code_filter");

      const authorizedMiss = await deps.findOneDeviceCode({
        userCode: "USER-FILTER",
        status: "authorized"
      });
      expect(authorizedMiss).toBeNull();
    });

    it("findOneAndDeleteAuthorized lets exactly one of two concurrent deletes win", async () => {
      const deps = getDeps();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await deps.createDeviceCode({
        codeId: "code_concurrent",
        deviceCode: "device_concurrent",
        userCode: "USER-CONCURRENT",
        expiresAt
      });
      await deps.updateStatus("USER-CONCURRENT", "authorized", { userId: "dev_concurrent" });

      const [first, second] = await Promise.all([
        deps.findOneAndDeleteAuthorized("device_concurrent"),
        deps.findOneAndDeleteAuthorized("device_concurrent")
      ]);

      const winners = [first, second].filter((result) => result !== null);
      const losers = [first, second].filter((result) => result === null);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(winners[0]?.codeId).toBe("code_concurrent");

      await expect(deps.findOneDeviceCode({ deviceCode: "device_concurrent" })).resolves.toBeNull();
    });
  });
}
