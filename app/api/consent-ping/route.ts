import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";

export const runtime = "nodejs";

const VALID_STATES = new Set(["accepted", "rejected", "dismissed", "unknown"]);

export async function POST(req: NextRequest) {
  const limit = await checkRateLimit(req);
  if (limit.limited) return rateLimitError();

  const { body, error } = await readJsonObject(req);
  if (error) return error;

  // Allowlist the state value so arbitrary strings cannot be injected into logs.
  const rawState = typeof body?.state === "string" ? body.state : "unknown";
  const state = VALID_STATES.has(rawState) ? rawState : "unknown";

  logger.info("consent_banner", { state, ua: req.headers.get("user-agent") });
  return NextResponse.json({ ok: true });
}
