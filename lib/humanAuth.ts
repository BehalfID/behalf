import { NextResponse, type NextRequest } from "next/server";
import { jsonAppError } from "@/lib/appErrors";
import {
  getCurrentDeveloper,
  getDeveloperFromToken,
  isEmailVerified,
  requireDashboardMutationOrigin,
  requireDeveloperApi,
  type DeveloperAccount
} from "@/lib/developerAuth";
import { authenticateDeveloperToken } from "@/lib/developerToken";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { findAccount } from "@/lib/repositories/accounts";
import { findByUserId } from "@/lib/repositories/users";

const COOKIE_NAME = "behalfid_developer";

const TOKEN_USER_SELECT =
  "-_id userId email emailVerified onboardingUseCase primaryAccountId firstName lastName jobTitle onboardingCompletedAt createdAt updatedAt";

export type HumanAuthResult = {
  user: Awaited<ReturnType<typeof getCurrentDeveloper>>;
  account: DeveloperAccount;
  error: NextResponse | null;
  authMethod: "session" | "developer_token" | null;
};

export async function requireHumanDeveloperApi(request: NextRequest): Promise<HumanAuthResult> {
  const sessionAuth = await requireDeveloperApi(request);
  if (sessionAuth.user) {
    return {
      user: sessionAuth.user,
      account: sessionAuth.account,
      error: null,
      authMethod: "session"
    };
  }

  const limit = await checkRateLimit(request);
  if (limit.limited) {
    return { user: null, account: null, error: rateLimitError(), authMethod: null };
  }

  const originError = requireDashboardMutationOrigin(request);
  if (originError) {
    return { user: null, account: null, error: originError, authMethod: null };
  }

  const { tokenDoc, error: tokenError } = await authenticateDeveloperToken(request);
  if (tokenError) {
    return {
      user: null,
      account: null,
      error: jsonAppError(tokenError, 401, "INVALID_DEVELOPER_TOKEN"),
      authMethod: null
    };
  }
  if (!tokenDoc) {
    return {
      user: null,
      account: null,
      error: sessionAuth.error ?? jsonAppError("Developer authentication required.", 401, "AUTH_REQUIRED"),
      authMethod: null
    };
  }

  const user = await findByUserId(tokenDoc.userId, { select: TOKEN_USER_SELECT });
  if (!user) {
    return {
      user: null,
      account: null,
      error: jsonAppError("Developer authentication required.", 401, "AUTH_REQUIRED"),
      authMethod: null
    };
  }

  if (!isEmailVerified(user.emailVerified)) {
    return {
      user: null,
      account: null,
      error: jsonAppError(
        "Email verification required. Check your inbox or resend the verification email.",
        403,
        "EMAIL_VERIFICATION_REQUIRED"
      ),
      authMethod: null
    };
  }

  const account = await findAccount({ accountId: tokenDoc.accountId });
  return { user, account, error: null, authMethod: "developer_token" };
}

export async function getHumanAuthFromRequest(request: NextRequest): Promise<HumanAuthResult> {
  const context = await getDeveloperFromToken(request.cookies.get(COOKIE_NAME)?.value);
  if (context) {
    const account = context.activeAccountId
      ? await findAccount({ accountId: context.activeAccountId })
      : null;
    return { user: context.user, account, error: null, authMethod: "session" };
  }

  const { tokenDoc } = await authenticateDeveloperToken(request);
  if (!tokenDoc) {
    return {
      user: null,
      account: null,
      error: jsonAppError("Developer authentication required.", 401, "AUTH_REQUIRED"),
      authMethod: null
    };
  }

  const tokenUser = await findByUserId(tokenDoc.userId, { select: TOKEN_USER_SELECT });
  if (!tokenUser) {
    return {
      user: null,
      account: null,
      error: jsonAppError("Developer authentication required.", 401, "AUTH_REQUIRED"),
      authMethod: null
    };
  }
  const account = await findAccount({ accountId: tokenDoc.accountId });
  return { user: tokenUser, account, error: null, authMethod: "developer_token" };
}
