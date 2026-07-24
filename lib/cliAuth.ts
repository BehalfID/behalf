import type { NextRequest } from "next/server";
import { jsonAppError } from "@/lib/appErrors";
import { authenticateApiKey } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { DEVELOPER_SESSION_COOKIE_NAME, getDeveloperFromToken } from "@/lib/developerAuth";

export type CliAuthContext = {
  userId: string | null;
  accountId: string | null;
  agentId: string | null;
  source: "session" | "agent" | "anonymous";
};

export async function requireCliAuth(request: NextRequest): Promise<
  | { auth: CliAuthContext; error: null }
  | { auth: null; error: ReturnType<typeof jsonAppError> }
> {
  await connectToDatabase();

  const developer = await getDeveloperFromToken(
    request.cookies.get(DEVELOPER_SESSION_COOKIE_NAME)?.value
  );
  if (developer) {
    return {
      auth: {
        userId: developer.user.userId,
        accountId: developer.activeAccountId ?? developer.user.primaryAccountId ?? null,
        agentId: null,
        source: "session",
      },
      error: null,
    };
  }

  const agentAuth = await authenticateApiKey(request);
  if (agentAuth.agent) {
    return {
      auth: {
        userId: null,
        accountId: agentAuth.agent.accountId ?? null,
        agentId: agentAuth.agent.agentId,
        source: "agent",
      },
      error: null,
    };
  }

  return {
    auth: {
      userId: null,
      accountId: null,
      agentId: null,
      source: "anonymous",
    },
    error: null,
  };
}

export async function requireCliAuthStrict(request: NextRequest) {
  const result = await requireCliAuth(request);
  if (result.auth?.source === "anonymous") {
    return {
      auth: null,
      error: jsonAppError("Developer authentication required.", 401, "AUTH_REQUIRED"),
    };
  }
  return result;
}

export async function requireDeveloperSessionForPause(request: NextRequest) {
  const result = await requireCliAuth(request);
  if (result.auth?.source === "anonymous") {
    return {
      auth: null,
      error: jsonAppError("Developer authentication required.", 401, "AUTH_REQUIRED"),
    };
  }
  if (result.auth?.source === "agent" || !result.auth?.userId) {
    return {
      auth: null,
      error: jsonAppError("Pause leases require a developer session.", 403, "SESSION_REQUIRED"),
    };
  }
  return result;
}
