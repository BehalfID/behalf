import { type NextRequest } from "next/server";
import { getInvitePreview } from "@/lib/inviteAcceptance";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError, noCacheJson } from "@/lib/responses";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const limit = await checkRateLimit(_request);
  if (limit.limited) return rateLimitError();

  const { token } = await context.params;
  if (!token?.trim()) return jsonError("Invite token is required.", 400);

  const preview = await getInvitePreview(decodeURIComponent(token.trim()));
  if (!preview) return jsonError("This invite link is invalid.", 404);

  return noCacheJson({ invite: preview });
}
