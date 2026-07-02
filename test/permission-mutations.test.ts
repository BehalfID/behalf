import { describe, expect, it } from "vitest";
import { parsePermissionBody } from "@/lib/permissionMutations";

describe("parsePermissionBody", () => {
  it("rejects expiresAt values in the past", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const result = await parsePermissionBody({
      action: "repo.read",
      constraints: { expiresAt: past }
    });

    expect(result).toHaveProperty("error");
    if (!("error" in result) || !result.error) return;
    const body = await result.error.json();
    expect(body.error).toBe("expiresAt must be in the future.");
  });
});
