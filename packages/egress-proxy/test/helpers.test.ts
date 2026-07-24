import { describe, expect, it } from "vitest";
import { hostInList, hostMatchesPattern, parseHostPort } from "../src/types";

describe("egress proxy helpers", () => {
  it("parses host:port authorities including IPv6", () => {
    expect(parseHostPort("example.com:443", 80)).toEqual({ host: "example.com", port: 443 });
    expect(parseHostPort("[::1]:8443", 443)).toEqual({ host: "::1", port: 8443 });
  });

  it("matches allow/deny host patterns", () => {
    expect(hostMatchesPattern("api.stripe.com", "*.stripe.com")).toBe(true);
    expect(hostMatchesPattern("evil.com", "*.stripe.com")).toBe(false);
    expect(hostInList("api.github.com", ["*.github.com", "npmjs.org"])).toBe(true);
  });
});
