import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { updateEndpoint } from "@/lib/repositories/webhooks";

type RouteContext = {
  params: Promise<{ webhookId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { webhookId } = await context.params;
  const result = await updateEndpoint(
    { developerUserId: auth.user.userId, webhookId },
    { $set: { status: "disabled" } }
  );
  if (result.matchedCount !== 1) return jsonError("Webhook not found.", 404);
  return NextResponse.json({ disabled: true });
}
