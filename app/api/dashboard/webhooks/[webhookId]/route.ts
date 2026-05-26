import { NextResponse, type NextRequest } from "next/server";
import { getDeveloperWebhookDetail } from "@/lib/dashboardData";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError, noCacheJson } from "@/lib/responses";

type RouteContext = {
  params: Promise<{ webhookId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { webhookId } = await context.params;
  const detail = await getDeveloperWebhookDetail(auth.user.userId, webhookId);
  if (!detail) return jsonError("Webhook not found.", 404);
  return noCacheJson(detail);
}
