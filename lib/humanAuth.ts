import { NextResponse, type NextRequest } from "next/server";
import {
  getCurrentDeveloper,
  getDeveloperFromToken,
  requireDashboardMutationOrigin,
  requireDeveloperApi,
  type DeveloperAccount
} from "@/lib/developerAuth";
import { authenticateDeveloperToken } from "@/lib/developerToken";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import Account from "@/models/Account";
import DeveloperUser from "@/models/DeveloperUser";

const COOKIE_NAME = "behalfid_developer";

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
    return { user: null, account: null, error: jsonError(tokenError, 401), authMethod: null };
  }
  if (!tokenDoc) {
    return {
      user: null,
      account: null,
      error: sessionAuth.error ?? jsonError("Developer authentication required.", 401),
      authMethod: null
    };
  }

  await connectToDatabase();
  const user = await DeveloperUser.findOne({ userId: tokenDoc.userId })
    .select("-_id userId email emailVerified onboardingUseCase primaryAccountId firstName lastName jobTitle onboardingCompletedAt createdAt updatedAt")
    .lean();
  if (!user) {
    return { user: null, account: null, error: jsonError("Developer authentication required.", 401), authMethod: null };
  }

  const account = await Account.findOne({ accountId: tokenDoc.accountId }).lean();
  return { user, account, error: null, authMethod: "developer_token" };
}

export async function getHumanAuthFromRequest(request: NextRequest): Promise<HumanAuthResult> {
  const context = await getDeveloperFromToken(request.cookies.get(COOKIE_NAME)?.value);
  if (context) {
    const account = context.activeAccountId
      ? await Account.findOne({ accountId: context.activeAccountId }).lean()
      : null;
    return { user: context.user, account, error: null, authMethod: "session" };
  }

  const { tokenDoc } = await authenticateDeveloperToken(request);
  if (!tokenDoc) {
    return { user: null, account: null, error: jsonError("Developer authentication required.", 401), authMethod: null };
  }

  await connectToDatabase();
  const tokenUser = await DeveloperUser.findOne({ userId: tokenDoc.userId })
    .select("-_id userId email emailVerified onboardingUseCase primaryAccountId firstName lastName jobTitle onboardingCompletedAt createdAt updatedAt")
    .lean();
  if (!tokenUser) {
    return { user: null, account: null, error: jsonError("Developer authentication required.", 401), authMethod: null };
  }
  const account = await Account.findOne({ accountId: tokenDoc.accountId }).lean();
  return { user: tokenUser, account, error: null, authMethod: "developer_token" };
}
