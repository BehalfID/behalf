import { describe, expect, it } from "vitest";
import { safeRelativePath } from "@/lib/safeRedirect";
import { safeOAuthNextPath as googleSafeNext } from "@/lib/googleOAuthClient";
import { safeOAuthNextPath as githubSafeNext } from "@/lib/githubOAuthClient";
import { safeOAuthNextPath as stateSafeNext } from "@/lib/authProviders/oauthState";

const BYPASSES = [
  "//evil.example",
  "/\\evil.example",
  "/\\/evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r\n/evil.example",
  "/dashboard\\..\\..\\evil",
  "https://evil.example",
  "javascript:alert(1)",
  "dashboard",
  ""
];

describe("safeRelativePath", () => {
  it("accepts same-origin paths with query and hash", () => {
    expect(safeRelativePath("/dashboard")).toBe("/dashboard");
    expect(safeRelativePath("/dashboard/approvals?tab=pending#top")).toBe(
      "/dashboard/approvals?tab=pending#top"
    );
    expect(safeRelativePath("/")).toBe("/");
  });

  it.each(BYPASSES)("rejects off-origin or malformed target %j", (value) => {
    expect(safeRelativePath(value)).toBeUndefined();
  });

  it("rejects values that browsers would resolve to another origin", () => {
    // Regression: `/\evil.example` passed the old startsWith("//") check but
    // `new URL` (and browsers) resolve it to https://evil.example/.
    expect(new URL("/\\evil.example", "https://behalfid.com").origin).toBe("https://evil.example");
    expect(safeRelativePath("/\\evil.example")).toBeUndefined();
  });

  it("rejects null, undefined and oversized values", () => {
    expect(safeRelativePath(null)).toBeUndefined();
    expect(safeRelativePath(undefined)).toBeUndefined();
    expect(safeRelativePath(`/${"a".repeat(600)}`)).toBeUndefined();
  });

  it.each([
    ["google", googleSafeNext],
    ["github", githubSafeNext],
    ["oauthState", stateSafeNext]
  ])("%s safeOAuthNextPath rejects backslash/control-char bypasses", (_name, fn) => {
    for (const value of BYPASSES) expect(fn(value)).toBeUndefined();
    expect(fn("/dashboard")).toBe("/dashboard");
  });
});
