import { describe, expect, it } from "vitest";
import {
  createWebhookEvent,
  hashWebhookSecret,
  signWebhookPayload
} from "@/lib/webhooks";
import { sanitizeDeliveryError } from "@/lib/webhookWorker";
import { verifyWebhookSignature } from "../packages/sdk/src/webhooks";
import { rawApiKey } from "./fixtures";

describe("webhook signing and payload safety", () => {
  it("creates verification payloads without raw API keys", () => {
    const event = createWebhookEvent("acct_test", "verification.allowed", {
      requestId: "req_test",
      agentId: "agent_test",
      action: "purchase",
      allowed: true,
      risk: "low",
      permissionId: "perm_test"
    }, "dev_test");

    expect(event).toEqual(expect.objectContaining({
      type: "verification.allowed",
      accountId: "acct_test"
    }));
    expect(JSON.stringify(event)).not.toContain(rawApiKey);
    expect(JSON.stringify(event)).not.toContain("apiKey");
  });

  it("produces HMAC signatures that the SDK verifier accepts", async () => {
    const secret = "whsec_test_secret";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ eventId: "evt_test", type: "verification.allowed" });
    const signature = signWebhookPayload(hashWebhookSecret(secret), timestamp, body);

    await expect(verifyWebhookSignature({
      secret,
      timestamp,
      payload: body,
      signature: `v1=${signature}`
    })).resolves.toBe(true);
  });

  it("rejects invalid signatures, wrong bodies, wrong secrets, and replayed timestamps", async () => {
    const secret = "whsec_test_secret";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ eventId: "evt_test", type: "verification.allowed" });
    const signature = `v1=${signWebhookPayload(hashWebhookSecret(secret), timestamp, body)}`;

    await expect(verifyWebhookSignature({
      secret,
      timestamp,
      payload: `${body} `,
      signature
    })).resolves.toBe(false);

    await expect(verifyWebhookSignature({
      secret: "whsec_wrong",
      timestamp,
      payload: body,
      signature
    })).resolves.toBe(false);

    await expect(verifyWebhookSignature({
      secret,
      timestamp,
      payload: body,
      signature: "v1=deadbeef"
    })).resolves.toBe(false);

    await expect(verifyWebhookSignature({
      secret,
      timestamp: String(Math.floor(Date.now() / 1000) - 301),
      payload: body,
      signature,
      toleranceSeconds: 300
    })).resolves.toBe(false);
  });

  it("redacts raw secrets from webhook delivery errors", () => {
    const message = sanitizeDeliveryError(
      `failed with ${rawApiKey} whsec_secret Bearer ${rawApiKey} authorization=${rawApiKey}`
    );

    expect(message).toContain("bhf_sk_[redacted]");
    expect(message).toContain("whsec_[redacted]");
    expect(message).toContain("Bearer [redacted]");
    expect(message).toContain("authorization=[redacted]");
    expect(message).not.toContain(rawApiKey);
    expect(message).not.toContain("whsec_secret");
  });
});
