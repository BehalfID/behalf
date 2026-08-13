import { type NextRequest } from "next/server";
import { jsonAppError } from "@/lib/appErrors";
import { getWorkspaceActor } from "@/lib/delegatedAuth";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { noCacheJson } from "@/lib/responses";
import { getWorkspaceProtectionStatus } from "@/lib/setupReadiness";

/**
 * Which protection surfaces this workspace actually has, derived from observed
 * decisions rather than from what someone configured once.
 *
 * Protecting Claude Code on a laptop must never render as "you are covered" for
 * CI or a production service, so each surface is answered independently.
 */
export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const actor = await getWorkspaceActor(auth.user.userId, auth.activeAccountId);
  if (!actor) return jsonAppError("Workspace account required.", 403, "WORKSPACE_ACCOUNT_REQUIRED");

  const surfaces = await getWorkspaceProtectionStatus(actor.accountId);
  return noCacheJson({ surfaces });
}
