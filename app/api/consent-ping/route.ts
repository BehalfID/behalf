import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { state } = await req.json().catch(() => ({ state: "unknown" }));
  logger.info("consent_banner", { state, ua: req.headers.get("user-agent") });
  return NextResponse.json({ ok: true });
}
