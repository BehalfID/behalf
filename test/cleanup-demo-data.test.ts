import { describe, expect, it } from "vitest";
import {
  CLEANUP_CONFIRMATION,
  isDemoDeveloperUser,
  isDemoSite,
  isDestructiveModeAllowed,
  parseCleanupArgs
} from "@/scripts/cleanup-demo-data-helpers";

describe("demo cleanup selection helpers", () => {
  it("matches the Site Guard demo domains", () => {
    expect(isDemoSite({ domain: "demo.site.com", name: "Developer docs" })).toBe(true);
    expect(isDemoSite({ domain: "docs.example.com", name: "Docs" })).toBe(true);
  });

  it("does not match normal-looking sites or users", () => {
    expect(isDemoSite({ domain: "behalfid.com", name: "BehalfID" })).toBe(false);
    expect(isDemoDeveloperUser({ email: "ops@behalfid.com" })).toBe(false);
  });

  it("only allows destructive mode with execute and the exact confirmation", () => {
    expect(isDestructiveModeAllowed(parseCleanupArgs(["--execute"]))).toBe(false);
    expect(isDestructiveModeAllowed(parseCleanupArgs(["--confirm", CLEANUP_CONFIRMATION]))).toBe(false);
    expect(isDestructiveModeAllowed(parseCleanupArgs(["--execute", "--confirm", "wrong"]))).toBe(false);
    expect(isDestructiveModeAllowed(parseCleanupArgs(["--execute", "--confirm", CLEANUP_CONFIRMATION]))).toBe(true);
  });
});
