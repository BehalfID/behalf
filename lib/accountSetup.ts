import { connectToDatabase } from "@/lib/db";
import { canManageMembers, getWorkspaceActor } from "@/lib/delegatedAuth";
import {
  defaultWorkspaceName,
  getNextRouteForFirstSetupGoal,
  legacyUseCaseToAccountType,
  normalizeWebsite,
  type AccountOnboarding,
  type AccountSetupAccount,
  type AccountSetupProfile,
  validateAccountSetupCompletion,
  validateAccountType,
  validateCompanyName,
  validateEnumArray,
  validateFirstSetupGoal,
  validateJobTitle,
  validateNameField,
  validateOtherText,
  validatePhone,
  validatePrimaryGoal,
  validateTeamSize,
  validateWorkspaceName,
  AGENT_TOOLS,
  CONTROL_AREAS
} from "@/lib/onboarding";
import { readString } from "@/lib/validation";
import Account from "@/models/Account";
import DeveloperUser from "@/models/DeveloperUser";

const PROFILE_FIELDS = ["firstName", "lastName", "jobTitle", "phone"] as const;
const ACCOUNT_FIELDS = [
  "accountType",
  "companyName",
  "workspaceName",
  "website",
  "teamSize"
] as const;
const ONBOARDING_FIELDS = [
  "agentTools",
  "agentToolsOther",
  "controlAreas",
  "controlAreasOther",
  "primaryGoal",
  "firstSetupGoal"
] as const;

export const PATCH_ALLOWED_FIELDS = [
  ...PROFILE_FIELDS,
  ...ACCOUNT_FIELDS,
  ...ONBOARDING_FIELDS
];

export type AccountSetupState = {
  profile: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    emailVerified: boolean;
    jobTitle: string | null;
    phone: string | null;
  };
  account: {
    accountId: string | null;
    accountType: string | null;
    companyName: string | null;
    workspaceName: string | null;
    website: string | null;
    teamSize: string | null;
    onboarding: AccountOnboarding | null;
    legacyAccountType: string | null;
  };
  onboardingCompletedAt: string | null;
  membershipRole: string | null;
};

export async function loadAccountSetupState(
  userId: string,
  primaryAccountId: string | null | undefined
): Promise<AccountSetupState | null> {
  await connectToDatabase();
  const user = await DeveloperUser.findOne({ userId })
    .select(
      "userId email emailVerified firstName lastName jobTitle phone onboardingCompletedAt onboardingUseCase primaryAccountId"
    )
    .lean();
  if (!user) return null;

  const account = primaryAccountId
    ? await Account.findOne({ accountId: primaryAccountId }).lean()
    : null;

  const actor = primaryAccountId ? await getWorkspaceActor(userId, primaryAccountId) : null;

  return {
    profile: {
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      email: user.email,
      emailVerified: user.emailVerified !== false,
      jobTitle: user.jobTitle ?? null,
      phone: user.phone ?? null
    },
    account: {
      accountId: account?.accountId ?? null,
      accountType: account?.accountType ?? null,
      companyName: account?.companyName ?? null,
      workspaceName: account?.name ?? null,
      website: account?.website ?? null,
      teamSize: account?.teamSize ?? null,
      onboarding: account?.onboarding
        ? {
            agentTools: (account.onboarding.agentTools ?? undefined) as AccountOnboarding["agentTools"],
            agentToolsOther: account.onboarding.agentToolsOther ?? undefined,
            controlAreas: (account.onboarding.controlAreas ?? undefined) as AccountOnboarding["controlAreas"],
            controlAreasOther: account.onboarding.controlAreasOther ?? undefined,
            primaryGoal: account.onboarding.primaryGoal ?? undefined,
            firstSetupGoal: account.onboarding.firstSetupGoal ?? undefined
          }
        : null,
      legacyAccountType: legacyUseCaseToAccountType(user.onboardingUseCase) ?? null
    },
    onboardingCompletedAt: user.onboardingCompletedAt
      ? new Date(user.onboardingCompletedAt).toISOString()
      : null,
    membershipRole: actor?.role ?? null
  };
}

function hasAccountField(body: Record<string, unknown>): boolean {
  return ACCOUNT_FIELDS.some((field) => field in body) || ONBOARDING_FIELDS.some((field) => field in body);
}

function hasProfileField(body: Record<string, unknown>): boolean {
  return PROFILE_FIELDS.some((field) => field in body);
}

export async function patchAccountSetup(
  userId: string,
  primaryAccountId: string | null | undefined,
  body: Record<string, unknown>
): Promise<{ error: string | null; status?: number }> {
  await connectToDatabase();

  const actor = primaryAccountId ? await getWorkspaceActor(userId, primaryAccountId) : null;
  const touchesAccount = hasAccountField(body);
  const touchesProfile = hasProfileField(body);

  if (touchesAccount) {
    if (!primaryAccountId || !actor) {
      return { error: "Workspace account required.", status: 403 };
    }
    if (!canManageMembers(actor)) {
      return { error: "You do not have permission to update workspace settings.", status: 403 };
    }
  }

  if (!touchesAccount && !touchesProfile) {
    return { error: "No supported fields provided." };
  }

  const userUpdate: Record<string, unknown> = {};
  const accountUpdate: Record<string, unknown> = {};
  const onboardingUpdate: Record<string, unknown> = {};

  if ("firstName" in body) {
    const result = validateNameField(body.firstName, "firstName", false);
    if (result.error) return { error: result.error };
    userUpdate.firstName = result.value ?? null;
  }

  if ("lastName" in body) {
    const result = validateNameField(body.lastName, "lastName", false);
    if (result.error) return { error: result.error };
    userUpdate.lastName = result.value ?? null;
  }

  if ("jobTitle" in body) {
    const result = validateJobTitle(body.jobTitle);
    if (result.error) return { error: result.error };
    userUpdate.jobTitle = result.value ?? null;
  }

  if ("phone" in body) {
    const result = validatePhone(body.phone, false);
    if (result.error) return { error: result.error };
    userUpdate.phone = result.value ?? null;
  }

  if ("accountType" in body) {
    const result = validateAccountType(body.accountType, false);
    if (result.error) return { error: result.error };
    accountUpdate.accountType = result.value ?? null;
  }

  if ("companyName" in body) {
    const account = primaryAccountId
      ? await Account.findOne({ accountId: primaryAccountId }).select("accountType").lean()
      : null;
    const accountType =
      ("accountType" in body ? validateAccountType(body.accountType, false).value : undefined) ??
      account?.accountType;
    const result = validateCompanyName(body.companyName, accountType ?? undefined, false);
    if (result.error) return { error: result.error };
    accountUpdate.companyName = result.value ?? null;
  }

  if ("workspaceName" in body) {
    const result = validateWorkspaceName(body.workspaceName, false);
    if (result.error) return { error: result.error };
    accountUpdate.name = result.value ?? null;
  }

  if ("website" in body) {
    const result = normalizeWebsite(body.website);
    if (result.error) return { error: result.error };
    accountUpdate.website = result.value ?? null;
  }

  if ("teamSize" in body) {
    const result = validateTeamSize(body.teamSize);
    if (result.error) return { error: result.error };
    accountUpdate.teamSize = result.value ?? null;
  }

  if ("agentTools" in body) {
    const result = validateEnumArray(body.agentTools, AGENT_TOOLS, "agentTools", false);
    if (result.error) return { error: result.error };
    onboardingUpdate.agentTools = result.value ?? [];
  }

  if ("agentToolsOther" in body) {
    const result = validateOtherText(
      Array.isArray(body.agentTools) ? (body.agentTools as string[]) : undefined,
      body.agentToolsOther,
      "other",
      "agentToolsOther",
      120,
      false
    );
    if (result.error) return { error: result.error };
    onboardingUpdate.agentToolsOther = result.value ?? null;
  }

  if ("controlAreas" in body) {
    const result = validateEnumArray(body.controlAreas, CONTROL_AREAS, "controlAreas", false);
    if (result.error) return { error: result.error };
    onboardingUpdate.controlAreas = result.value ?? [];
  }

  if ("controlAreasOther" in body) {
    const result = validateOtherText(
      Array.isArray(body.controlAreas) ? (body.controlAreas as string[]) : undefined,
      body.controlAreasOther,
      "other",
      "controlAreasOther",
      200,
      false
    );
    if (result.error) return { error: result.error };
    onboardingUpdate.controlAreasOther = result.value ?? null;
  }

  if ("primaryGoal" in body) {
    const result = validatePrimaryGoal(body.primaryGoal, false);
    if (result.error) return { error: result.error };
    onboardingUpdate.primaryGoal = result.value ?? null;
  }

  if ("firstSetupGoal" in body) {
    const result = validateFirstSetupGoal(body.firstSetupGoal, false);
    if (result.error) return { error: result.error };
    onboardingUpdate.firstSetupGoal = result.value ?? null;
  }

  if (Object.keys(userUpdate).length) {
    await DeveloperUser.updateOne({ userId }, { $set: userUpdate });
  }

  if (primaryAccountId && (Object.keys(accountUpdate).length || Object.keys(onboardingUpdate).length)) {
    const setPayload: Record<string, unknown> = { ...accountUpdate };
    for (const [key, value] of Object.entries(onboardingUpdate)) {
      setPayload[`onboarding.${key}`] = value;
    }
    await Account.updateOne({ accountId: primaryAccountId }, { $set: setPayload });
  }

  return { error: null };
}

export async function completeAccountSetup(
  userId: string,
  primaryAccountId: string | null | undefined,
  body: Record<string, unknown>
): Promise<{ error: string | null; status?: number; nextRoute?: string }> {
  if (!primaryAccountId) {
    return { error: "Workspace account required.", status: 403 };
  }

  const actor = await getWorkspaceActor(userId, primaryAccountId);
  if (!actor) {
    return { error: "Workspace account required.", status: 403 };
  }
  if (!canManageMembers(actor)) {
    return { error: "You do not have permission to complete workspace setup.", status: 403 };
  }

  const input: AccountSetupProfile & AccountSetupAccount & { onboarding?: AccountOnboarding } = {
    firstName: readString(body.firstName),
    lastName: readString(body.lastName),
    jobTitle: readString(body.jobTitle),
    phone: readString(body.phone),
    accountType: readString(body.accountType) as AccountSetupAccount["accountType"],
    companyName: readString(body.companyName),
    workspaceName: readString(body.workspaceName),
    website: readString(body.website),
    teamSize: readString(body.teamSize) as AccountSetupAccount["teamSize"],
    onboarding: {
      agentTools: Array.isArray(body.agentTools) ? (body.agentTools as AccountOnboarding["agentTools"]) : undefined,
      agentToolsOther: readString(body.agentToolsOther),
      controlAreas: Array.isArray(body.controlAreas)
        ? (body.controlAreas as AccountOnboarding["controlAreas"])
        : undefined,
      controlAreasOther: readString(body.controlAreasOther),
      primaryGoal: readString(body.primaryGoal) as AccountOnboarding["primaryGoal"],
      firstSetupGoal: readString(body.firstSetupGoal) as AccountOnboarding["firstSetupGoal"]
    }
  };

  if (!input.workspaceName) {
    input.workspaceName = defaultWorkspaceName({
      accountType: input.accountType,
      firstName: input.firstName,
      lastName: input.lastName,
      companyName: input.companyName
    });
  }

  const validated = validateAccountSetupCompletion(input);
  if (validated.error) {
    return { error: validated.error };
  }

  await connectToDatabase();

  await DeveloperUser.updateOne(
    { userId },
    {
      $set: {
        firstName: validated.profile.firstName,
        lastName: validated.profile.lastName,
        jobTitle: validated.profile.jobTitle ?? null,
        phone: validated.profile.phone ?? null,
        onboardingCompletedAt: new Date()
      }
    }
  );

  const existingAccount = await Account.findOne({ accountId: primaryAccountId })
    .select("slug")
    .lean();
  const existingSlug =
    typeof existingAccount?.slug === "string" ? existingAccount.slug.trim().toLowerCase() : "";

  const { validateWorkspaceSlug, workspaceDashboardHref } = await import("@/lib/workspaceSlug");
  const { generateUniqueWorkspaceSlug } = await import("@/lib/workspaceSlugServer");

  const accountSet: Record<string, unknown> = {
    accountType: validated.account.accountType,
    companyName: validated.account.companyName ?? null,
    name: validated.account.name,
    website: validated.account.website ?? null,
    teamSize: validated.account.teamSize ?? null,
    onboarding: validated.account.onboarding
  };

  // Preserve populated valid slugs; assign only when missing/invalid.
  let slug = existingSlug && validateWorkspaceSlug(existingSlug) === null ? existingSlug : "";
  if (!slug) {
    const seed =
      validated.account.companyName?.trim() || validated.account.name?.trim() || "workspace";
    slug = await generateUniqueWorkspaceSlug(seed, primaryAccountId);
    accountSet.slug = slug;
  }

  await Account.updateOne({ accountId: primaryAccountId }, { $set: accountSet });

  const nextBase = getNextRouteForFirstSetupGoal(validated.account.onboarding.firstSetupGoal);
  const nextRoute =
    slug && nextBase.startsWith("/dashboard")
      ? workspaceDashboardHref(slug, nextBase.slice("/dashboard".length) || "")
      : nextBase;

  return {
    error: null,
    nextRoute
  };
}
