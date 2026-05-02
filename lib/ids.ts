import crypto from "crypto";

export function createPublicId(prefix: "agent" | "perm" | "log") {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

export function createApiKey() {
  return `bhf_sk_${crypto.randomBytes(32).toString("base64url")}`;
}
