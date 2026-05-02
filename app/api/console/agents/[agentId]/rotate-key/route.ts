import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import { createApiKey } from "@/lib/ids";
import { jsonError } from "@/lib/responses";
import Agent from "@/models/Agent";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { agentId } = await context.params;
  const accountId = await getConsoleAccountId();
  const apiKey = createApiKey();
  const result = await Agent.updateOne(
    { accountId, agentId },
    {
      $set: {
        apiKeyHash: hashApiKey(apiKey),
        keyRotatedAt: new Date()
      }
    }
  );
  if (result.matchedCount !== 1) {
    return jsonError("Agent not found.", 404);
  }

  return NextResponse.json({ agentId, apiKey });
}
