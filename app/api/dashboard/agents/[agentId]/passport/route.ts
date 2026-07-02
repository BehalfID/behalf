import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey } from "@/lib/auth";
import { accountAgentFilter } from "@/lib/accountAgents";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";
import { createPassportToken } from "@/lib/ids";
import { jsonError } from "@/lib/responses";
import Agent from "@/models/Agent";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

function previewToken(token: string) {
  return `${token.slice(0, 12)}...${token.slice(-6)}`;
}

function passportUrl(request: NextRequest, agentId: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  return `${baseUrl.replace(/\/+$/, "")}/passport/${agentId}#token=${encodeURIComponent(token)}`;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const workspace = await requireWorkspaceMutationActor(auth.user, auth.activeAccountId);
  if (workspace.error) return workspace.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const { agentId } = await context.params;
  const token = createPassportToken();
  const agent = await Agent.findOneAndUpdate(
    accountAgentFilter(actor, agentId),
    {
      $set: {
        publicPassportTokenHash: hashApiKey(token),
        publicPassportTokenPreview: previewToken(token),
        publicPassportEnabled: true
      }
    },
    { returnDocument: "after" }
  );

  if (!agent) return jsonError("Agent not found.", 404);

  return NextResponse.json({
    agentId,
    passportUrl: passportUrl(request, agentId, token),
    tokenPreview: previewToken(token)
  });
}
