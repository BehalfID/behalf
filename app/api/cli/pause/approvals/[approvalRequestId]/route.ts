import type { NextRequest } from "next/server";
import { requireDeveloperSessionForPause } from "@/lib/cliAuth";
import { getPauseApprovalStatusForRequester } from "@/lib/managedProfilePauseApproval";
import { jsonError, noCacheJson } from "@/lib/responses";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ approvalRequestId: string }> }
) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const authResult = await requireDeveloperSessionForPause(request);
  if (authResult.error || !authResult.auth) return authResult.error;

  const { approvalRequestId } = await context.params;
  const id = approvalRequestId?.trim();
  if (!id) return jsonError("approvalRequestId is required.", 400);

  const status = await getPauseApprovalStatusForRequester(authResult.auth, id);
  if (!status) return jsonError("Pause approval not found.", 404);

  return noCacheJson(status);
}
