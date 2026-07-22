import crypto from "crypto";

export function createPublicId(
  prefix:
    | "acct"
    | "agent"
    | "perm"
    | "log"
    | "req"
    | "evt"
    | "wh"
    | "dlv"
    | "user"
    | "sess"
    | "tok"
    | "dev"
    | "site"
    | "sgr"
    | "sgk"
    | "apr"
    | "enq"
    | "mbr"
    | "inv"
    | "pprf"
    | "pause"
    | "clia"
    | "pend"
<<<<<<< HEAD
    | "pol"
    | "ibind"
    | "omsg"
=======
    | "adrec"
    | "adev"
>>>>>>> origin/main
) {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

// Generates an 8-char human-friendly user code formatted as XXXX-XXXX.
// Uses an unambiguous alphabet (no O/0, I/1, S/5, B/8).
// Rejection sampling eliminates the modulo bias that arises when 256 is not
// evenly divisible by the alphabet size (29): values >= floor(256/29)*29 are
// discarded and re-drawn so every character index is equally likely.
export function createUserCode(): string {
  const chars = "ACDEFGHJKLMNPQRTUVWXYZ2346789"; // 29 chars
  const limit = Math.floor(256 / chars.length) * chars.length; // 261 — but 256 < 261, so limit = 232
  // limit = floor(256 / 29) * 29 = 8 * 29 = 232; bytes >= 232 are rejected.
  let raw = "";
  while (raw.length < 8) {
    const batch = crypto.randomBytes(16); // generate extras to reduce loop iterations
    for (const byte of batch) {
      if (byte < limit) {
        raw += chars[byte % chars.length];
        if (raw.length === 8) break;
      }
    }
  }
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
