import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";

export const runtime = "nodejs";

// Must stay in step with the ping() calls in components/ui/CookieBanner.tsx.
// A refusal has to be distinguishable from a non-answer: collapsing "declined"
// into "unknown" leaves no record that consent was actually withheld.
const VALID_STATES = new Set([
  "accepted",
  "declined",
  "shown",
  "already-set:accepted",
  "already-set:declined",
  "storage-error",
  "unknown"
]);

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
