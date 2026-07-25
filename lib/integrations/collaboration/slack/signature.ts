import crypto from "crypto";
import { timingSafeEqualString } from "@/lib/crypto";

/**
 * Verify Slack request signature (v0 HMAC-SHA256).
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(input: {
  signingSecret: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  rawBody: string;
  nowSeconds?: number;
  maxSkewSeconds?: number;
}): boolean {
  const { signingSecret, signatureHeader, timestampHeader, rawBody } = input;
  const maxSkew = input.maxSkewSeconds ?? 60 * 5;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!signingSecret || !signatureHeader || !timestampHeader) return false;
  if (!signatureHeader.startsWith("v0=")) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now - timestamp) > maxSkew) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
  const expected = `v0=${digest}`;
  return timingSafeEqualString(expected, signatureHeader);
}
