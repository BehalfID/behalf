import crypto from "crypto";

export function createPublicId(
  prefix: "acct" | "agent" | "perm" | "log" | "req" | "evt" | "wh" | "dlv" | "user" | "sess" | "tok" | "dev" | "site" | "sgr" | "sgk" | "apr"
) {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

// Generates an 8-char human-friendly user code formatted as XXXX-XXXX.
// Uses an unambiguous alphabet (no O/0, I/1, S/5, B/8).
export function createUserCode(): string {
  const chars = "ACDEFGHJKLMNPQRTUVWXYZ2346789";
  const bytes = crypto.randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i++) raw += chars[bytes[i] % chars.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
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

export function createDeveloperToken() {
  return `bhf_dev_${crypto.randomBytes(32).toString("base64url")}`;
}

export function createSiteGuardKey() {
  return `bhf_site_${crypto.randomBytes(32).toString("base64url")}`;
}
