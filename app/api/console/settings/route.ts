import mongoose from "mongoose";
import { NextResponse, type NextRequest } from "next/server";
import {
  isPublicAgentCreationEnabled,
  isSetupTokenConfigured,
  requireConsoleApi
} from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";
import { getRateLimitMode } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
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
    environment: process.env.NODE_ENV ?? "development",
    mongoConfigured: Boolean(process.env.MONGODB_URI),
    mongoStatus,
    publicAgentCreation: isPublicAgentCreationEnabled() ? "enabled" : "disabled",
    setupTokenConfigured: isSetupTokenConfigured(),
    rateLimitMode: getRateLimitMode(),
    metadataLogging: process.env.BEHALFID_LOG_METADATA === "false" ? "disabled" : "enabled",
    securityWarnings: [
      ...(getRateLimitMode() === "memory"
        ? ["Rate limits are process-local. Use Upstash Redis for public deployments."]
        : []),
      ...(!isSetupTokenConfigured() && !isPublicAgentCreationEnabled()
        ? ["Public agent creation is disabled and no setup token is configured."]
        : []),
      ...(process.env.BEHALFID_LOG_METADATA === "false"
        ? []
        : ["Optional verification metadata is persisted when clients provide it."])
    ],
    limitations: [
      "Console uses one admin password for prototype deployments.",
      "Rate limits should use Redis or Upstash in production.",
      "Public API keys are shown only at creation or rotation.",
      "Webhook delivery uses an API-route worker; configure a scheduler for production.",
      "Webhook delivery is at least once, so receivers should deduplicate by event ID.",
      "No user accounts, organizations, OAuth, or payments yet."
    ]
  });
}
