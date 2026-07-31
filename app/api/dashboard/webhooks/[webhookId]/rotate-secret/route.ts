import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError } from "@/lib/responses";
import { createSigningSecret } from "@/lib/webhooks";
import { findOneAndUpdateEndpoint } from "@/lib/repositories/webhooks";

type RouteContext = {
  params: Promise<{ webhookId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { webhookId } = await context.params;
  const signing = createSigningSecret();
  const webhook = await findOneAndUpdateEndpoint(
    { developerUserId: auth.user.userId, webhookId },
    { $set: { secretHash: signing.secretHash, secretPreview: signing.secretPreview } },
    { returnDocument: "after" }
  );
  if (!webhook) return jsonError("Webhook not found.", 404);
  return NextResponse.json({ webhookId, secret: signing.secret });
}
