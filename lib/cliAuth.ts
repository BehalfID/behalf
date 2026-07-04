import type { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { DEVELOPER_SESSION_COOKIE_NAME, getDeveloperFromToken } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";

export type CliAuthContext = {
  userId: string | null;
  accountId: string | null;
  agentId: string | null;
  source: "session" | "agent" | "anonymous";
};

export async function requireCliAuth(request: NextRequest): Promise<
  | { auth: CliAuthContext; error: null }
  | { auth: null; error: ReturnType<typeof jsonError> }
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
        accountId: agentAuth.agent.accountId,
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
      error: jsonError("Developer authentication required.", 401),
    };
  }
  return result;
}
