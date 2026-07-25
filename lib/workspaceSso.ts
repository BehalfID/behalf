import { getPlanEntitlements } from "@/lib/plans";
import Account from "@/models/Account";
import AccountMembership from "@/models/AccountMembership";

/** Public email providers that must not be used for workspace SSO enforce domains. */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "yandex.com",
  "zoho.com"
]);

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

export function normalizeEmailDomain(domain: string): string | null {
  const normalized = domain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!normalized || normalized.includes("@") || normalized.includes(" ") || normalized.length > 253) {
    return null;
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}

export function accountAllowsEmailDomain(
  allowedEmailDomains: string[] | null | undefined,
  domain: string
): boolean {
  if (!allowedEmailDomains?.length) return false;
  const normalized = domain.trim().toLowerCase();
  return allowedEmailDomains.some((entry) => entry.trim().toLowerCase() === normalized);
}

export type WorkspaceSsoConfig = {
  provider: "google";
  enabled: boolean;
  enforce: boolean;
  allowedEmailDomains: string[];
};

export function readWorkspaceSso(account: {
  sso?: {
    provider?: string | null;
    enabled?: boolean | null;
    enforce?: boolean | null;
    allowedEmailDomains?: string[] | null;
  } | null;
} | null): WorkspaceSsoConfig {
  const sso = account?.sso;
  return {
    provider: "google",
    enabled: Boolean(sso?.enabled),
    enforce: Boolean(sso?.enforce),
    allowedEmailDomains: Array.isArray(sso?.allowedEmailDomains)
      ? sso.allowedEmailDomains.map((d) => d.trim().toLowerCase()).filter(Boolean)
      : []
  };
}

/**
 * Returns true when password login must be blocked for this email because some
 * entitled workspace enforces Google SSO for the email's domain.
 */
export async function isPasswordLoginBlockedBySso(email: string): Promise<boolean> {
  const domain = emailDomain(email);
  if (!domain || isPublicEmailDomain(domain)) return false;

  const accounts = await Account.find({
    "sso.enabled": true,
    "sso.enforce": true,
    "sso.allowedEmailDomains": domain
  })
    .select("accountId plan sso")
    .lean();

  for (const account of accounts) {
    const entitlements = getPlanEntitlements(account.plan);
    if (!entitlements.googleWorkspaceSsoEnabled) continue;
    const sso = readWorkspaceSso(account);
    if (sso.enabled && sso.enforce && accountAllowsEmailDomain(sso.allowedEmailDomains, domain)) {
      return true;
    }
  }

  return false;
}

/**
 * Prefer an SSO-enabled workspace the user already belongs to when the email
 * domain matches that workspace's allowlist.
 */
export async function resolvePreferredSsoAccountId(
  userId: string,
  email: string
): Promise<string | null> {
  const domain = emailDomain(email);
  if (!domain) return null;

  const memberships = await AccountMembership.find({ userId }).select("accountId").lean();
  if (memberships.length === 0) return null;

  const accountIds = memberships.map((m) => m.accountId);
  const accounts = await Account.find({
    accountId: { $in: accountIds },
    "sso.enabled": true,
    "sso.allowedEmailDomains": domain
  })
    .select("accountId plan sso")
    .lean();

  for (const account of accounts) {
    const entitlements = getPlanEntitlements(account.plan);
    if (!entitlements.googleWorkspaceSsoEnabled) continue;
    const sso = readWorkspaceSso(account);
    if (sso.enabled && accountAllowsEmailDomain(sso.allowedEmailDomains, domain)) {
      return account.accountId;
    }
  }

  return null;
}

export function validateSsoDomainList(
  domains: unknown,
  options: { enforce: boolean }
): { ok: true; domains: string[] } | { ok: false; error: string } {
  if (!Array.isArray(domains)) {
    return { ok: false, error: "allowedEmailDomains must be an array of domain strings." };
  }
  if (domains.length > 20) {
    return { ok: false, error: "At most 20 email domains are allowed." };
  }

  const normalized: string[] = [];
  for (const entry of domains) {
    if (typeof entry !== "string") {
      return { ok: false, error: "Each allowed email domain must be a string." };
    }
    const domain = normalizeEmailDomain(entry);
    if (!domain) {
      return { ok: false, error: `Invalid email domain: ${entry}` };
    }
    if (options.enforce && isPublicEmailDomain(domain)) {
      return {
        ok: false,
        error: `Public email domains cannot be used when SSO enforcement is enabled (${domain}).`
      };
    }
    if (!normalized.includes(domain)) {
      normalized.push(domain);
    }
  }

  if (options.enforce && normalized.length === 0) {
    return { ok: false, error: "At least one company email domain is required when SSO is enforced." };
  }

  return { ok: true, domains: normalized };
}
