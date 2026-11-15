import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { checkWebhooksEnabled, quotaErrorDetails } from "@/lib/quota";
import { jsonError } from "@/lib/responses";
import { updateEndpoint } from "@/lib/repositories/webhooks";
import { requireWorkspaceMutationActor } from "@/lib/workspaceActor";

type RouteContext = {
  params: Promise<{ webhookId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const actorCheck = await requireWorkspaceMutationActor(auth.user, auth.activeAccountId);
  if (actorCheck.error || !actorCheck.actor) return actorCheck.error;
  // The plan check below is for the active workspace, so only that workspace's
  // endpoints may be re-enabled here (a downgraded workspace's endpoints must
  // not be re-enabled from another workspace on a paid plan).
  const webhookQuota = checkWebhooksEnabled(auth.account);
  if (!webhookQuota.allowed) {
    return jsonError(webhookQuota.reason ?? "Webhooks are not available on this plan.", 403, quotaErrorDetails(webhookQuota));
  }
  const { webhookId } = await context.params;
  const result = await updateEndpoint(
    { developerUserId: auth.user.userId, accountId: actorCheck.actor.accountId, webhookId },
    { $set: { status: "active" } }
  );
  if (result.matchedCount !== 1) return jsonError("Webhook not found.", 404);
  return NextResponse.json({ enabled: true });
}
