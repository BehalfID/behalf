import crypto from "node:crypto";
import { ACCOUNT_SETUP_LAUNCH } from "@/lib/onboarding";
import { createPublicId } from "@/lib/ids";
import Account from "@/models/Account";
import AccountInvite from "@/models/AccountInvite";
import AccountMembership from "@/models/AccountMembership";
import Agent from "@/models/Agent";
import ApprovalRequest from "@/models/ApprovalRequest";
import DeveloperApiToken from "@/models/DeveloperApiToken";
import DeveloperSession from "@/models/DeveloperSession";
import DeveloperUser from "@/models/DeveloperUser";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";
import { ensureAccountMembership } from "@/lib/delegatedAuth";

export const DEFAULT_INTERNAL_DEMO_EMAIL =
  "internal-onboarding-demo+behalfid-7f3a91c2@behalfid.internal"; // pragma: allowlist secret

export const DEFAULT_INTERNAL_DEMO_DATE_OF_BIRTH = "1990-01-15";

export const MIN_INTERNAL_DEMO_PASSWORD_LENGTH = 46;

export const PUBLIC_CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com"
]);

const WEAK_PASSWORD_SUBSTRINGS = ["password", "test", "demo", "changeme"] as const;

const PASSWORD_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_=+";

export const NON_PRODUCTION_DATABASE_SEGMENTS = new Set([
  "local",
  "dev",
  "development",
  "test",
  "testing",
  "staging",
  "preview",
  "sandbox"
]);

export const PRODUCTION_DATABASE_SEGMENTS = new Set(["prod", "production", "live"]);

export const INTERNAL_DEMO_RESET_REFUSAL_REASON =
  "Refusing to reset the internal demo account because the database does not clearly look non-production. " +
  "Use a local/dev/test/staging database, or set ALLOW_INTERNAL_DEMO_RESET=1 only if you intentionally want to override this guard.";

export type InternalDemoResetEnv = {
  NODE_ENV?: string;
  ALLOW_INTERNAL_DEMO_RESET?: string;
  ALLOW_PUBLIC_DEMO_EMAIL?: string;
  INTERNAL_DEMO_EMAIL?: string;
  INTERNAL_DEMO_PASSWORD?: string;
  KEEP_INTERNAL_DEMO_DATA?: string;
  MONGODB_URI?: string;
};

export type InternalDemoResetResult = {
  email: string;
  userAction: "created" | "updated";
  accountAction: "created" | "updated" | "repaired";
  membershipAction: "created" | "existing";
  onboardingReset: boolean;
  demoDataCleared: boolean;
  demoDataPreserved: boolean;
  passwordGenerated: boolean;
};

export function isProductionNodeEnv(nodeEnv?: string) {
  return (nodeEnv ?? process.env.NODE_ENV ?? "development").trim().toLowerCase() === "production";
}

export function extractDatabaseName(mongodbUri?: string | null) {
  if (!mongodbUri?.trim()) {
    return null;
  }

  try {
    const normalized = mongodbUri.replace(/^mongodb(\+srv)?:\/\//, "http://");
    const url = new URL(normalized);
    const pathname = url.pathname.replace(/^\//, "").split("/")[0];
    if (pathname) {
      return decodeURIComponent(pathname);
    }
  } catch {
    // Fall through to regex parsing.
  }

  const match = mongodbUri.match(/\/([^/?]+)(?:\?|$)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function splitDatabaseNameSegments(databaseName: string) {
  return databaseName
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isNonProductionDatabaseName(databaseName: string) {
  const segments = splitDatabaseNameSegments(databaseName);
  if (segments.length === 0) {
    return false;
  }

  if (segments.some((segment) => PRODUCTION_DATABASE_SEGMENTS.has(segment))) {
    return false;
  }

  return segments.some((segment) => NON_PRODUCTION_DATABASE_SEGMENTS.has(segment));
}

export function canRunInternalDemoReset(env: InternalDemoResetEnv) {
  if (env.ALLOW_INTERNAL_DEMO_RESET === "1") {
    return { allowed: true as const };
  }

  const databaseName = extractDatabaseName(env.MONGODB_URI);
  if (!databaseName || !isNonProductionDatabaseName(databaseName)) {
    return {
      allowed: false as const,
      reason: INTERNAL_DEMO_RESET_REFUSAL_REASON
    };
  }

  return { allowed: true as const };
}

export function getEmailDomain(email: string) {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0) {
    return "";
  }
  return email.slice(atIndex + 1).trim().toLowerCase();
}

export function isPublicConsumerEmail(email: string) {
  return PUBLIC_CONSUMER_EMAIL_DOMAINS.has(getEmailDomain(email));
}

export function resolveDemoEmail(env: InternalDemoResetEnv) {
  const email = (env.INTERNAL_DEMO_EMAIL?.trim() || DEFAULT_INTERNAL_DEMO_EMAIL).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: "INTERNAL_DEMO_EMAIL must be a valid email address." };
  }

  if (env.ALLOW_PUBLIC_DEMO_EMAIL !== "1" && isPublicConsumerEmail(email)) {
    return {
      error:
        "Refusing to use a public consumer email domain for the internal demo account. " +
        "Use an internal address or set ALLOW_PUBLIC_DEMO_EMAIL=1."
    };
  }

  return { email };
}

export function hasExcessiveRepeatedCharacters(password: string) {
  return /(.)\1{5,}/.test(password);
}

export function isWeakInternalDemoPassword(password: string) {
  const normalized = password.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (WEAK_PASSWORD_SUBSTRINGS.some((substring) => normalized.includes(substring))) {
    return true;
  }

  return hasExcessiveRepeatedCharacters(password);
}

export function validateInternalDemoPassword(password: string) {
  if (password.length < MIN_INTERNAL_DEMO_PASSWORD_LENGTH) {
    return {
      valid: false as const,
      error: `INTERNAL_DEMO_PASSWORD must be at least ${MIN_INTERNAL_DEMO_PASSWORD_LENGTH} characters.`
    };
  }

  if (password.length > 200) {
    return {
      valid: false as const,
      error: "INTERNAL_DEMO_PASSWORD must be at most 200 characters."
    };
  }

  if (isWeakInternalDemoPassword(password)) {
    return {
      valid: false as const,
      error:
        "INTERNAL_DEMO_PASSWORD is too weak. Use a high-entropy value without obvious placeholders."
    };
  }

  return { valid: true as const };
}

export function generateInternalDemoPassword(length = MIN_INTERNAL_DEMO_PASSWORD_LENGTH + 2) {
  const targetLength = Math.max(length, MIN_INTERNAL_DEMO_PASSWORD_LENGTH);
  const bytes = crypto.randomBytes(targetLength);
  let password = "";

  for (let index = 0; index < targetLength; index += 1) {
    password += PASSWORD_CHARSET[bytes[index]! % PASSWORD_CHARSET.length];
  }

  const requiredSets = [
    /[A-Z]/,
    /[a-z]/,
    /[0-9]/,
    /[!@#$%^&*\-_=+]/
  ] as const;

  for (const [index, pattern] of requiredSets.entries()) {
    if (!pattern.test(password)) {
      const replacement = PASSWORD_CHARSET[index * 11];
      const position = index % password.length;
      password = password.slice(0, position) + replacement + password.slice(position + 1);
    }
  }

  return password;
}

export function resolveInternalDemoPassword(env: InternalDemoResetEnv) {
  const provided = env.INTERNAL_DEMO_PASSWORD?.trim();
  if (provided) {
    const validation = validateInternalDemoPassword(provided);
    if (!validation.valid) {
      return { password: "", generated: false, error: validation.error };
    }
    return { password: provided, generated: false };
  }

  if (isProductionNodeEnv(env.NODE_ENV)) {
    return {
      password: "",
      generated: false,
      error: "INTERNAL_DEMO_PASSWORD is required when NODE_ENV is production."
    };
  }

  const password = generateInternalDemoPassword();
  return { password, generated: true };
}

export function shouldPreserveInternalDemoData(env: InternalDemoResetEnv) {
  return env.KEEP_INTERNAL_DEMO_DATA === "1";
}

export function shouldClearInternalDemoData(env: InternalDemoResetEnv) {
  return !shouldPreserveInternalDemoData(env);
}

export function buildDeveloperUserOnboardingReset() {
  return {
    $set: {
      onboardingCompletedAt: null,
      firstName: null,
      lastName: null,
      jobTitle: null,
      phone: null,
      emailVerified: true
    },
    $unset: {
      emailVerificationTokenHash: "",
      emailVerificationTokenExpiresAt: "",
      emailVerificationCodeHash: "",
      passwordResetTokenHash: "",
      passwordResetTokenExpiresAt: ""
    }
  };
}

export function buildAccountOnboardingReset(workspaceName: string) {
  return {
    $set: {
      name: workspaceName,
      verificationCount: 0
    },
    $unset: {
      accountType: "",
      companyName: "",
      website: "",
      teamSize: "",
      onboarding: ""
    }
  };
}

function defaultWorkspaceName(email: string) {
  return email.split("@")[0]?.trim() || email;
}

async function clearDemoOwnedData(accountId: string, userId: string) {
  const agents = await Agent.find({ accountId }).select("agentId").lean();
  const agentIds = agents.map((agent) => agent.agentId);

  const permissionFilter =
    agentIds.length > 0
      ? { $or: [{ accountId }, { agentId: { $in: agentIds } }] }
      : { accountId };

  await VerificationLog.deleteMany({
    $or: [{ accountId }, { developerUserId: userId }, ...(agentIds.length ? [{ agentId: { $in: agentIds } }] : [])]
  });
  await ApprovalRequest.deleteMany({
    $or: [{ accountId }, { developerUserId: userId }, ...(agentIds.length ? [{ agentId: { $in: agentIds } }] : [])]
  });
  await Permission.deleteMany(permissionFilter);
  await Agent.deleteMany({ accountId });
  await AccountInvite.deleteMany({ accountId });
  await DeveloperApiToken.deleteMany({ $or: [{ accountId }, { userId }] });
  await DeveloperSession.deleteMany({ userId });
}

async function ensureDemoAccount(email: string, userId: string, primaryAccountId?: string | null) {
  const workspaceName = defaultWorkspaceName(email);

  if (primaryAccountId) {
    const existingAccount = await Account.findOne({ accountId: primaryAccountId }).lean();
    if (existingAccount) {
      await Account.updateOne(
        { accountId: primaryAccountId },
        buildAccountOnboardingReset(workspaceName)
      );
      return { accountId: primaryAccountId, action: "updated" as const };
    }
  }

  const account = await Account.create({
    accountId: createPublicId("acct"),
    name: workspaceName
  });

  await DeveloperUser.updateOne({ userId }, { $set: { primaryAccountId: account.accountId } });

  return { accountId: account.accountId, action: primaryAccountId ? ("repaired" as const) : ("created" as const) };
}

export async function runInternalDemoAccountReset(input: {
  env: InternalDemoResetEnv;
  hashPassword: (password: string) => Promise<string>;
}) {
  const guard = canRunInternalDemoReset(input.env);
  if (!guard.allowed) {
    throw new Error(guard.reason);
  }

  const emailResult = resolveDemoEmail(input.env);
  if ("error" in emailResult) {
    throw new Error(emailResult.error);
  }

  const passwordResult = resolveInternalDemoPassword(input.env);
  if (passwordResult.error) {
    throw new Error(passwordResult.error);
  }

  const email = emailResult.email;
  const passwordHash = await input.hashPassword(passwordResult.password);
  const clearDemoData = shouldClearInternalDemoData(input.env);
  const onboardingReset = buildDeveloperUserOnboardingReset();
  const launchCutoff = ACCOUNT_SETUP_LAUNCH;

  let user = await DeveloperUser.findOne({ email }).select("+passwordHash").lean();
  let userAction: "created" | "updated";

  if (!user) {
    const created = await DeveloperUser.create({
      userId: createPublicId("user"),
      email,
      passwordHash,
      dateOfBirth: DEFAULT_INTERNAL_DEMO_DATE_OF_BIRTH,
      emailVerified: true,
      createdAt: launchCutoff
    });
    user = created.toObject();
    userAction = "created";
  } else {
    const createdAt =
      user.createdAt && new Date(user.createdAt) < launchCutoff ? launchCutoff : user.createdAt;

    await DeveloperUser.updateOne(
      { userId: user.userId },
      {
        $set: {
          ...onboardingReset.$set,
          passwordHash,
          dateOfBirth: user.dateOfBirth ?? DEFAULT_INTERNAL_DEMO_DATE_OF_BIRTH,
          ...(createdAt ? { createdAt } : {})
        },
        $unset: onboardingReset.$unset
      }
    );
    userAction = "updated";
  }

  if (clearDemoData && user.primaryAccountId) {
    await clearDemoOwnedData(user.primaryAccountId, user.userId);
  }

  const accountResult = await ensureDemoAccount(email, user.userId, user.primaryAccountId);
  const membershipBefore = await AccountMembership.findOne({
    userId: user.userId,
    accountId: accountResult.accountId
  }).lean();

  await ensureAccountMembership(user.userId, accountResult.accountId);

  if (!clearDemoData) {
    await DeveloperSession.deleteMany({ userId: user.userId });
  }

  return {
    email,
    userAction,
    accountAction: accountResult.action,
    membershipAction: membershipBefore ? ("existing" as const) : ("created" as const),
    onboardingReset: true,
    demoDataCleared: clearDemoData,
    demoDataPreserved: !clearDemoData,
    passwordGenerated: passwordResult.generated,
    generatedPassword: passwordResult.generated ? passwordResult.password : undefined
  } satisfies InternalDemoResetResult & { generatedPassword?: string };
}
