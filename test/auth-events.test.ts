import { describe, expect, it } from "vitest";
import { hashIp, sanitizeAuthEventForRead } from "@/lib/authEvents";

describe("authEvents", () => {
  it("hashes IPs without retaining the raw value in the hash helper output length", () => {
    const hash = hashIp("203.0.113.10");
    expect(hash).toHaveLength(32);
    expect(hash).not.toContain("203");
  });

  it("rejects auth event payloads that look like secrets", () => {
    expect(() =>
      sanitizeAuthEventForRead({
        eventId: "ae_1",
        surface: "developer_login",
        outcome: "failure",
        reason: "invalid_credentials",
        ipHash: "abc",
        identityHint: "Bearer bhf_sk_secret"
      })
    ).toThrow(/secret/i);
  });

  it("allows safe identity hints", () => {
    const event = sanitizeAuthEventForRead({
      eventId: "ae_2",
      surface: "developer_login",
      outcome: "failure",
      reason: "invalid_credentials",
      ipHash: "abc",
      identityHint: "email:*@example.com"
    });
    expect(event.identityHint).toBe("email:*@example.com");
  });
});
