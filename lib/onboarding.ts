import { readString } from "@/lib/validation";

export const ACCOUNT_TYPES = ["individual", "business"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TEAM_SIZES = ["1", "2-5", "6-20", "21-50", "51+"] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

export const AGENT_TOOLS = [
  "claude_code",
  "codex",
  "cursor",
  "github_actions",
  "internal",
  "other"
] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

export const CONTROL_AREAS = [
  "production_deploys",
  "github_writes",
  "db_migrations",
  "secrets",
  "billing_vendor_apis",
  "external_comms",
  "other"
] as const;
export type ControlArea = (typeof CONTROL_AREAS)[number];

export const PRIMARY_GOALS = ["approvals", "block", "audit", "limits"] as const;
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];

export const FIRST_SETUP_GOALS = [
  "create_agent",
  "setup_deploy_approvals",
  "apply_permission_profile",
  "invite_team",
  "explore_sandbox"
] as const;
export type FirstSetupGoal = (typeof FIRST_SETUP_GOALS)[number];

/** @deprecated Legacy signup wizard value; kept for backwards compatibility. */
export const LEGACY_ONBOARDING_USE_CASES = ["personal", "website", "sdk"] as const;
export type LegacyOnboardingUseCase = (typeof LEGACY_ONBOARDING_USE_CASES)[number];

/** Users created before account setup v1 shipped are not hard-redirected to setup. */
export const ACCOUNT_SETUP_LAUNCH = new Date("2026-07-02T00:00:00.000Z");

export type AccountOnboarding = {
  agentTools?: AgentTool[];
  agentToolsOther?: string;
  controlAreas?: ControlArea[];
  controlAreasOther?: string;
  primaryGoal?: PrimaryGoal;
  firstSetupGoal?: FirstSetupGoal;
};

export type AccountSetupProfile = {
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  phone?: string;
};

export type AccountSetupAccount = {
  accountType?: AccountType;
  companyName?: string;
  workspaceName?: string;
  website?: string;
  teamSize?: TeamSize;
  onboarding?: AccountOnboarding;
};

export const FIRST_SETUP_GOAL_ROUTES: Record<FirstSetupGoal, string> = {
  create_agent: "/dashboard/agents/new",
  setup_deploy_approvals: "/dashboard/agents/new?focus=production_deploys",
  apply_permission_profile: "/dashboard/agents/new?focus=profiles",
  invite_team: "/dashboard/settings?panel=members",
  explore_sandbox: "/sandbox"
};

export function getNextRouteForFirstSetupGoal(goal: FirstSetupGoal): string {
  return FIRST_SETUP_GOAL_ROUTES[goal];
}

export function isAllowedValue<T extends readonly string[]>(
  value: string,
  allowed: T
): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeOptionalString(value: unknown, maxLength: number): string | undefined {
  const trimmed = readString(value);
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

export function validateNameField(
  value: unknown,
  fieldLabel: string,
  required: boolean
): { value?: string; error: string | null } {
  const trimmed = readString(value);
  if (!trimmed) {
    return required
      ? { error: `${fieldLabel} is required.` }
      : { value: undefined, error: null };
  }
  if (trimmed.length > 80) {
    return { error: `${fieldLabel} must be at most 80 characters.` };
  }
  return { value: trimmed, error: null };
}

const INVALID_PHONE_PATTERN = /[^\d+\-().\s]/;

export function validatePhone(value: unknown, required = false): { value?: string; error: string | null } {
  const trimmed = readString(value);
  if (!trimmed) {
    return required ? { error: "phone is required." } : { value: undefined, error: null };
  }
  if (trimmed.length > 20) {
    return { error: "phone must be at most 20 characters." };
  }
  if (INVALID_PHONE_PATTERN.test(trimmed)) {
    return { error: "phone contains invalid characters." };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) {
    return { error: "phone must contain at least 7 digits." };
  }
  return { value: trimmed, error: null };
}

export function validateJobTitle(value: unknown): { value?: string; error: string | null } {
  const trimmed = readString(value);
  if (!trimmed) return { value: undefined, error: null };
  if (trimmed.length > 120) {
    return { error: "jobTitle must be at most 120 characters." };
  }
  return { value: trimmed, error: null };
}

export function validateAccountType(
  value: unknown,
  required: boolean
): { value?: AccountType; error: string | null } {
  const trimmed = readString(value);
  if (!trimmed) {
    return required ? { error: "accountType is required." } : { value: undefined, error: null };
  }
  if (!isAllowedValue(trimmed, ACCOUNT_TYPES)) {
    return { error: "accountType must be individual or business." };
  }
  return { value: trimmed, error: null };
}

export function validateCompanyName(
  value: unknown,
  accountType: AccountType | undefined,
  required: boolean
): { value?: string; error: string | null } {
  const trimmed = readString(value);
  const mustRequire = required && accountType === "business";
  if (!trimmed) {
    return mustRequire ? { error: "companyName is required for business accounts." } : { value: undefined, error: null };
  }
  if (trimmed.length > 200) {
    return { error: "companyName must be at most 200 characters." };
  }
  return { value: trimmed, error: null };
}

export function validateWorkspaceName(
  value: unknown,
  required: boolean
): { value?: string; error: string | null } {
  const trimmed = readString(value);
  if (!trimmed) {
    return required ? { error: "workspaceName is required." } : { value: undefined, error: null };
  }
  if (trimmed.length > 120) {
    return { error: "workspaceName must be at most 120 characters." };
  }
  return { value: trimmed, error: null };
}

export function normalizeWebsite(value: unknown): { value?: string; error: string | null } {
  const trimmed = readString(value);
  if (!trimmed) return { value: undefined, error: null };

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (!url.hostname || !url.hostname.includes(".")) {
      return { error: "website must be a valid URL." };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: "website must use http or https." };
    }
    return { value: url.toString(), error: null };
  } catch {
    return { error: "website must be a valid URL." };
  }
}

export function validateTeamSize(value: unknown): { value?: TeamSize; error: string | null } {
  const trimmed = readString(value);
  if (!trimmed) return { value: undefined, error: null };
  if (!isAllowedValue(trimmed, TEAM_SIZES)) {
    return { error: "teamSize is invalid." };
  }
  return { value: trimmed, error: null };
}

export function validateEnumArray<T extends readonly string[]>(
  values: unknown,
  allowed: T,
  fieldLabel: string,
  required: boolean,
  minCount = 1
): { value?: T[number][]; error: string | null } {
  const items = readStringArray(values);
  if (!items.length) {
    return required ? { error: `${fieldLabel} requires at least one value.` } : { value: undefined, error: null };
  }
  for (const item of items) {
    if (!isAllowedValue(item, allowed)) {
      return { error: `${fieldLabel} contains an invalid value: ${item}.` };
    }
  }
  if (required && items.length < minCount) {
    return { error: `${fieldLabel} requires at least one value.` };
  }
  return { value: items as T[number][], error: null };
}

export function validateOtherText(
  values: string[] | undefined,
  otherValue: unknown,
  otherSelected: string,
  fieldLabel: string,
  maxLength: number,
  required: boolean
): { value?: string; error: string | null } {
  const selected = values ?? [];
  const trimmed = readString(otherValue);
  if (selected.includes(otherSelected)) {
    if (!trimmed) {
      return required ? { error: `${fieldLabel} is required when other is selected.` } : { value: undefined, error: null };
    }
    if (trimmed.length > maxLength) {
      return { error: `${fieldLabel} must be at most ${maxLength} characters.` };
    }
    return { value: trimmed, error: null };
  }
  if (trimmed && trimmed.length > maxLength) {
    return { error: `${fieldLabel} must be at most ${maxLength} characters.` };
  }
  return { value: trimmed || undefined, error: null };
}

export function validatePrimaryGoal(
  value: unknown,
  required: boolean
): { value?: PrimaryGoal; error: string | null } {
  const trimmed = readString(value);
  if (!trimmed) {
    return required ? { error: "primaryGoal is required." } : { value: undefined, error: null };
  }
  if (!isAllowedValue(trimmed, PRIMARY_GOALS)) {
    return { error: "primaryGoal is invalid." };
  }
  return { value: trimmed, error: null };
}

export function validateFirstSetupGoal(
  value: unknown,
  required: boolean
): { value?: FirstSetupGoal; error: string | null } {
  const trimmed = readString(value);
  if (!trimmed) {
    return required ? { error: "firstSetupGoal is required." } : { value: undefined, error: null };
  }
  if (!isAllowedValue(trimmed, FIRST_SETUP_GOALS)) {
    return { error: "firstSetupGoal is invalid." };
  }
  return { value: trimmed, error: null };
}

export function defaultWorkspaceName(input: {
  accountType?: AccountType;
  firstName?: string;
  lastName?: string;
  companyName?: string;
}): string {
  if (input.accountType === "business" && input.companyName) {
    return input.companyName.slice(0, 120);
  }
  const parts = [input.firstName, input.lastName].map((part) => readString(part)).filter(Boolean);
  if (parts.length) return parts.join(" ").slice(0, 120);
  return "";
}

/** Map legacy onboardingUseCase to a best-effort accountType for display only. */
export function legacyUseCaseToAccountType(
  useCase: LegacyOnboardingUseCase | string | null | undefined
): AccountType | undefined {
  if (useCase === "personal") return "individual";
  if (useCase === "website" || useCase === "sdk") return "business";
  return undefined;
}

export function shouldRedirectToAccountSetup(input: {
  onboardingCompletedAt?: Date | string | null;
  createdAt?: Date | string | null;
  agentCount?: number;
  verificationCount?: number;
}): boolean {
  if (input.onboardingCompletedAt) return false;
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
  if (createdAt < ACCOUNT_SETUP_LAUNCH) return false;
  if ((input.agentCount ?? 0) > 0) return false;
  if ((input.verificationCount ?? 0) > 0) return false;
  return true;
}

export function needsOnboardingBanner(onboardingCompletedAt?: Date | string | null): boolean {
  return !onboardingCompletedAt;
}

export type CompletionInput = AccountSetupProfile &
  AccountSetupAccount & {
    onboarding?: AccountOnboarding;
  };

export function validateAccountSetupCompletion(input: CompletionInput): {
  profile: Required<Pick<AccountSetupProfile, "firstName" | "lastName">> &
    Pick<AccountSetupProfile, "jobTitle" | "phone">;
  account: {
    accountType: AccountType;
    companyName?: string;
    name: string;
    website?: string;
    teamSize?: TeamSize;
    onboarding: Required<
      Pick<AccountOnboarding, "agentTools" | "controlAreas" | "primaryGoal" | "firstSetupGoal">
    > &
      Pick<AccountOnboarding, "agentToolsOther" | "controlAreasOther"> & {
        primaryGoal?: PrimaryGoal;
      };
  };
  error: string | null;
} {
  const firstName = validateNameField(input.firstName, "firstName", true);
  if (firstName.error) return { profile: {} as never, account: {} as never, error: firstName.error };

  const lastName = validateNameField(input.lastName, "lastName", true);
  if (lastName.error) return { profile: {} as never, account: {} as never, error: lastName.error };

  const phone = validatePhone(input.phone, false);
  if (phone.error) return { profile: {} as never, account: {} as never, error: phone.error };

  const jobTitle = validateJobTitle(input.jobTitle);
  if (jobTitle.error) return { profile: {} as never, account: {} as never, error: jobTitle.error };

  const accountType = validateAccountType(input.accountType, true);
  if (accountType.error) return { profile: {} as never, account: {} as never, error: accountType.error };

  const companyName = validateCompanyName(input.companyName, accountType.value, true);
  if (companyName.error) return { profile: {} as never, account: {} as never, error: companyName.error };

  const workspaceName = validateWorkspaceName(
    input.workspaceName || defaultWorkspaceName({
      accountType: accountType.value,
      firstName: firstName.value,
      lastName: lastName.value,
      companyName: companyName.value
    }),
    true
  );
  if (workspaceName.error) return { profile: {} as never, account: {} as never, error: workspaceName.error };

  const website = normalizeWebsite(input.website);
  if (website.error) return { profile: {} as never, account: {} as never, error: website.error };

  const teamSize = validateTeamSize(input.teamSize);
  if (teamSize.error) return { profile: {} as never, account: {} as never, error: teamSize.error };

  const agentTools = validateEnumArray(input.onboarding?.agentTools, AGENT_TOOLS, "agentTools", true);
  if (agentTools.error) return { profile: {} as never, account: {} as never, error: agentTools.error };

  const agentToolsOther = validateOtherText(
    agentTools.value,
    input.onboarding?.agentToolsOther,
    "other",
    "agentToolsOther",
    120,
    true
  );
  if (agentToolsOther.error) return { profile: {} as never, account: {} as never, error: agentToolsOther.error };

  const controlAreas = validateEnumArray(
    input.onboarding?.controlAreas,
    CONTROL_AREAS,
    "controlAreas",
    true
  );
  if (controlAreas.error) return { profile: {} as never, account: {} as never, error: controlAreas.error };

  const controlAreasOther = validateOtherText(
    controlAreas.value,
    input.onboarding?.controlAreasOther,
    "other",
    "controlAreasOther",
    200,
    true
  );
  if (controlAreasOther.error) return { profile: {} as never, account: {} as never, error: controlAreasOther.error };

  const primaryGoal = validatePrimaryGoal(input.onboarding?.primaryGoal, false);
  if (primaryGoal.error) return { profile: {} as never, account: {} as never, error: primaryGoal.error };

  const resolvedPrimaryGoal = primaryGoal.value ?? "approvals";

  const firstSetupGoal = validateFirstSetupGoal(input.onboarding?.firstSetupGoal, true);
  if (firstSetupGoal.error) return { profile: {} as never, account: {} as never, error: firstSetupGoal.error };

  return {
    profile: {
      firstName: firstName.value!,
      lastName: lastName.value!,
      jobTitle: jobTitle.value,
      phone: phone.value
    },
    account: {
      accountType: accountType.value!,
      companyName: companyName.value,
      name: workspaceName.value!,
      website: website.value,
      teamSize: teamSize.value,
      onboarding: {
        agentTools: agentTools.value!,
        agentToolsOther: agentToolsOther.value,
        controlAreas: controlAreas.value!,
        controlAreasOther: controlAreasOther.value,
        primaryGoal: resolvedPrimaryGoal,
        firstSetupGoal: firstSetupGoal.value!
      }
    },
    error: null
  };
}

export const AGENT_TOOL_LABELS: Record<AgentTool, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  github_actions: "GitHub Actions / CI agents",
  internal: "Internal agents",
  other: "Other"
};

export const CONTROL_AREA_LABELS: Record<ControlArea, string> = {
  production_deploys: "Production deploys",
  github_writes: "GitHub writes",
  db_migrations: "Database migrations",
  secrets: "Secrets and .env files",
  billing_vendor_apis: "Billing or vendor APIs",
  external_comms: "External communications",
  other: "Other"
};

export const PRIMARY_GOAL_LABELS: Record<PrimaryGoal, string> = {
  approvals: "Require approval before risky actions",
  block: "Block unsafe actions",
  audit: "Audit agent activity",
  limits: "Enforce limits"
};

export const FIRST_SETUP_GOAL_LABELS: Record<FirstSetupGoal, string> = {
  create_agent: "Set up my first coding agent",
  setup_deploy_approvals: "Set up deploy approvals",
  apply_permission_profile: "Apply a permission profile",
  invite_team: "Invite my team",
  explore_sandbox: "Explore the sandbox"
};

export const TEAM_SIZE_LABELS: Record<TeamSize, string> = {
  "1": "Just me",
  "2-5": "2–5",
  "6-20": "6–20",
  "21-50": "21–50",
  "51+": "51+"
};
