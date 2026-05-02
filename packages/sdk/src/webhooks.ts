import crypto from "node:crypto";

export type VerifyWebhookSignatureInput = {
  secret: string;
  payload: string | Buffer;
  timestamp: string | string[] | undefined;
  signature: string | string[] | undefined;
  toleranceSeconds?: number;
};

export async function verifyWebhookSignature({
  secret,
  payload,
  timestamp,
  signature,
  toleranceSeconds = 300
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
  const expected = sign(secret, timestampValue, rawBody);
  return timingSafeEqual(signatureValue.slice(3), expected);
}

function sign(secret: string, timestamp: string, rawBody: string) {
  const signingKey = crypto.createHash("sha256").update(secret).digest("hex");
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
