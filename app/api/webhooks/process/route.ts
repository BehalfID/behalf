import { NextResponse, type NextRequest } from "next/server";
import { requireSetupTokenOrConsoleApi } from "@/lib/adminAuth";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { processWebhookEvents } from "@/lib/webhookWorker";

export async function GET(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) {
    return rateLimitError();
  }

  const authError = requireSetupTokenOrConsoleApi(request);
  if (authError) {
    return authError;
  }

  try {
    const summary = await processWebhookEvents();
    return NextResponse.json({
      status: "ok",
      ...summary
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        error: "Webhook processing failed."
      },
      { status: 500 }
    );
  }
}
