import { describe, expect, it } from "vitest";
import { safeOAuthNextPath } from "@/lib/githubOAuthClient";

describe("GitHub OAuth client safeOAuthNextPath", () => {
  it("allows same-origin relative paths", () => {
    expect(safeOAuthNextPath("/dashboard")).toBe("/dashboard");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeOAuthNextPath("//evil.example")).toBeUndefined();
    expect(safeOAuthNextPath("https://evil.example")).toBeUndefined();
    expect(safeOAuthNextPath(null)).toBeUndefined();
    expect(safeOAuthNextPath(undefined)).toBeUndefined();
  });

  it("rejects backslash paths that the URL parser normalizes into a protocol-relative redirect", () => {
    // `new URL("/\\evil.example", origin)` resolves to "https://evil.example/" — a backslash
    // right after the leading slash must be rejected the same as a literal "//" prefix.
    expect(new URL("/\\evil.example", "https://good.example").href).toBe(
      "https://evil.example/"
    );
    expect(safeOAuthNextPath("/\\evil.example")).toBeUndefined();
  });

  it("rejects overlong next paths", () => {
    expect(safeOAuthNextPath(`/${"a".repeat(600)}`)).toBeUndefined();
  });
});
