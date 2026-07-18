import mongoose from "mongoose";
import { type NextRequest } from "next/server";
import { requireSetupTokenOrConsoleApi } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { noCacheJson } from "@/lib/responses";

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
    await connectToDatabase();
    return noCacheJson({
      status: "ok",
      service: "behalfid",
      database: mongoose.connection.readyState === 1 ? "connected" : "connecting"
    });
  } catch {
    return noCacheJson(
      { status: "error", service: "behalfid", database: "unavailable" },
      { status: 503 }
    );
  }
}
