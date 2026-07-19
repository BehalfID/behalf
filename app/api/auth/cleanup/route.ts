import { NextResponse, type NextRequest } from "next/server";
import { requireSetupTokenOrConsoleApi } from "@/lib/adminAuth";
import { cleanupUnverifiedAccounts } from "@/lib/authCleanup";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";

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
    const summary = await cleanupUnverifiedAccounts();
    return NextResponse.json({
      status: "ok",
      ...summary
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        error: "Unverified account cleanup failed."
      },
      { status: 500 }
    );
  }
}
