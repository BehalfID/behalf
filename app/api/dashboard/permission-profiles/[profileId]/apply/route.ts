import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { applyPermissionProfile } from "@/lib/permissionMutations";
import { jsonError } from "@/lib/responses";

type RouteContext = {
  params: Promise<{ profileId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonError("Workspace account required.", 403);

  const { profileId } = await context.params;
  const agentId = request.nextUrl.searchParams.get("agentId")?.trim();
  if (!agentId) return jsonError("agentId query parameter is required.");

  const result = await applyPermissionProfile({
    actor,
    userId: auth.user.userId,
    agentId,
    profileId
  });
  if ("error" in result && result.error) return result.error;

  return NextResponse.json(result, { status: 201 });
}
