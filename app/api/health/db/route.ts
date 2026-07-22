import mongoose from "mongoose";
import { type NextRequest } from "next/server";
import { requireSetupTokenOrConsoleApi } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";
import { isPostgresConfigured } from "@/lib/db/postgres";
import {
  listRepositoryBackendOverrides,
  resolveRepositoryBackend
} from "@/lib/repositories/backend";
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
    let repositoryBackend: "mongo" | "postgres" = "mongo";
    try {
      repositoryBackend = resolveRepositoryBackend();
    } catch {
      repositoryBackend = "mongo";
    }

    return noCacheJson({
      status: "ok",
      service: "behalfid",
      database: mongoose.connection.readyState === 1 ? "connected" : "connecting",
      postgresConfigured: isPostgresConfigured(),
      repositoryBackend,
      repositoryBackendOverrides: listRepositoryBackendOverrides()
    });
  } catch {
    return noCacheJson(
      { status: "error", service: "behalfid", database: "unavailable" },
      { status: 503 }
    );
  }
}
