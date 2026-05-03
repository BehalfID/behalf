import crypto from "crypto";

export function createPublicId(
  prefix: "acct" | "agent" | "perm" | "log" | "req" | "evt" | "wh" | "dlv" | "user" | "sess"
) {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

export function createWebhookSecret() {
  return `whsec_${crypto.randomBytes(32).toString("base64url")}`;
}

export function createApiKey() {
  return `bhf_sk_${crypto.randomBytes(32).toString("base64url")}`;
}

export function createPassportToken() {
  return `bhf_pass_${crypto.randomBytes(32).toString("base64url")}`;
}
