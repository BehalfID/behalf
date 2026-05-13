import crypto from "node:crypto";

export type VerifyWebhookSignatureInput = {
  secret: string;
  payload: string | Buffer;
  timestamp: string | string[] | undefined;
  signature: string | string[] | undefined;
  toleranceSeconds?: number;
  /**
   * Optional signing pepper that matches BEHALFID_WEBHOOK_SIGNING_PEPPER on the
   * server. When set, the effective HMAC key is HMAC-SHA256(pepper, SHA256(secret))
   * rather than SHA256(secret) alone. Configure this if the server has the pepper
   * environment variable set.
   */
  signingPepper?: string;
};

export async function verifyWebhookSignature({
  secret,
  payload,
  timestamp,
  signature,
  toleranceSeconds = 300,
  signingPepper
}: VerifyWebhookSignatureInput): Promise<boolean> {
  const timestampValue = Array.isArray(timestamp) ? timestamp[0] : timestamp;
  const signatureValue = Array.isArray(signature) ? signature[0] : signature;

  if (!secret || !timestampValue || !signatureValue?.startsWith("v1=")) {
    return false;
  }

  const timestampNumber = Number(timestampValue);
  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  if (Math.abs(Date.now() / 1000 - timestampNumber) > toleranceSeconds) {
    return false;
  }

  const rawBody = Buffer.isBuffer(payload) ? payload.toString("utf8") : payload;
  const expected = sign(secret, timestampValue, rawBody, signingPepper);
  return timingSafeEqual(signatureValue.slice(3), expected);
}

function sign(secret: string, timestamp: string, rawBody: string, pepper?: string) {
  const secretHash = crypto.createHash("sha256").update(secret).digest("hex");
  const signingKey = pepper
    ? crypto.createHmac("sha256", pepper).update(secretHash).digest("hex")
    : secretHash;
  return crypto.createHmac("sha256", signingKey).update(`${timestamp}.${rawBody}`).digest("hex");
}

function timingSafeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}
