import mongoose from "mongoose";
import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";

export async function GET(request: NextRequest) {
  const authError = requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  let mongoStatus = "disconnected";
  try {
    await connectToDatabase();
    mongoStatus = mongoose.connection.readyState === 1 ? "connected" : "connecting";
  } catch {
    mongoStatus = "error";
  }

  return NextResponse.json({
    appUrl:
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin ||
      "http://localhost:3000",
    mongoStatus,
    rateLimiting: "in-memory prototype",
    limitations: [
      "Console uses one admin password for prototype deployments.",
      "Rate limits are process-local and should move to Redis or Upstash.",
      "Public API keys are shown only at creation or rotation.",
      "No user accounts, organizations, OAuth, payments, or webhooks yet."
    ]
  });
}
