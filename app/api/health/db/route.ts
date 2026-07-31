import mongoose from "mongoose";
import { type NextRequest } from "next/server";
import { requireSetupTokenOrConsoleApi } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";
import { isPostgresConfigured } from "@/lib/db/postgres";
import {
  isPostgresRuntimeEnabled,
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

    const postgresRuntime = isPostgresRuntimeEnabled();
    let database: "connected" | "connecting" | "unavailable" = "unavailable";
    if (postgresRuntime) {
      if (!isPostgresConfigured()) {
        database = "unavailable";
      } else {
        try {
          const { getPostgresDb } = await import("@/lib/db/postgres");
          const { sql } = await import("drizzle-orm");
          await getPostgresDb().execute(sql`select 1`);
          database = "connected";
        } catch {
          database = "unavailable";
        }
      }
    } else {
      database = mongoose.connection.readyState === 1 ? "connected" : "connecting";
    }

    const payload = {
      status: database === "unavailable" ? "error" : "ok",
      service: "behalfid",
      database,
      postgresConfigured: isPostgresConfigured(),
      postgresRuntime,
      repositoryBackend,
      repositoryBackendOverrides: listRepositoryBackendOverrides()
    };

    return noCacheJson(payload, database === "unavailable" ? { status: 503 } : undefined);
  } catch {
    return noCacheJson(
      { status: "error", service: "behalfid", database: "unavailable" },
      { status: 503 }
    );
  }
}
