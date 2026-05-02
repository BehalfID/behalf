import crypto from "node:crypto";
export async function verifyWebhookSignature({ secret, payload, timestamp, signature, toleranceSeconds = 300 }) {
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
function sign(secret, timestamp, rawBody) {
    const signingKey = crypto.createHash("sha256").update(secret).digest("hex");
    return crypto.createHmac("sha256", signingKey).update(`${timestamp}.${rawBody}`).digest("hex");
}
function timingSafeEqual(a, b) {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(aBuffer, bBuffer);
}
