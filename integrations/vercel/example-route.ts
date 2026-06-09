/**
 * BehalfID on Vercel — example Next.js App Router API route.
 *
 * Status: DEPLOYMENT EXAMPLE — shows how to verify agent permissions in a
 * Vercel-hosted Next.js project. Not an official Vercel integration.
 *
 * To use: copy this file to app/api/agent-action/route.ts and adapt the
 * action logic at the bottom of the POST handler to your use case.
 *
 * Required Vercel environment variables:
 *   BEHALFID_API_KEY   — agent API key (bhf_sk_...)
 *   BEHALFID_AGENT_ID  — agent identifier
 *
 * Optional:
 *   BEHALFID_BASE_URL  — override for self-hosted deployments (default: https://behalfid.com)
 *
 * See integrations/vercel/README.md for full setup and env var instructions.
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Config ───────────────────────────────────────────────────────────────────

const BEHALFID_API_KEY = process.env.BEHALFID_API_KEY;
const BEHALFID_AGENT_ID = process.env.BEHALFID_AGENT_ID;
const BEHALFID_BASE_URL =
  process.env.BEHALFID_BASE_URL ?? "https://behalfid.com";

// ─── Minimal inline verify (no extra dep, edge-runtime compatible) ────────────

type VerifyInput = {
  agentId: string;
  action: string;
  amount?: number;
  vendor?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
};

type VerifyResult = {
  requestId: string;
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
};

async function verify(input: VerifyInput): Promise<VerifyResult> {
  const response = await fetch(`${BEHALFID_BASE_URL}/api/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BEHALFID_API_KEY}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`BehalfID verify returned ${response.status}`);
  }

  return response.json() as Promise<VerifyResult>;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Guard: configuration must be present before processing any request.
  if (!BEHALFID_API_KEY || !BEHALFID_AGENT_ID) {
    return NextResponse.json(
      {
        error:
          "BehalfID is not configured. " +
          "Set BEHALFID_API_KEY and BEHALFID_AGENT_ID in your Vercel project environment variables.",
      },
      { status: 503 }
    );
  }

  // Parse request body.
  let body: {
    action?: unknown;
    amount?: unknown;
    vendor?: unknown;
    resource?: unknown;
    metadata?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.action !== "string" || !body.action) {
    return NextResponse.json(
      { error: "action is required and must be a non-empty string." },
      { status: 400 }
    );
  }

  // Verify permission with BehalfID.
  let verifyResult: VerifyResult;
  try {
    verifyResult = await verify({
      agentId: BEHALFID_AGENT_ID,
      action: body.action,
      amount:
        typeof body.amount === "number" ? body.amount : undefined,
      vendor:
        typeof body.vendor === "string" ? body.vendor : undefined,
      resource:
        typeof body.resource === "string" ? body.resource : undefined,
      metadata:
        body.metadata !== null &&
        typeof body.metadata === "object" &&
        !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : undefined,
    });
  } catch (err) {
    // Fail closed: if BehalfID is unreachable, block the action.
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Permission check failed.", detail, allowed: false },
      { status: 503 }
    );
  }

  // Deny: return 403 with the reason so the caller can surface it.
  if (!verifyResult.allowed) {
    return NextResponse.json(
      {
        allowed: false,
        reason: verifyResult.reason,
        risk: verifyResult.risk,
        requestId: verifyResult.requestId,
      },
      { status: 403 }
    );
  }

  // ─── Allowed — run your application logic here ─────────────────────────────
  //
  // This branch only executes after BehalfID confirmed the action is permitted.
  // Replace the placeholder below with your real implementation.
  //
  // Examples:
  //   case "browse_web":  return await browseWebHandler(body);
  //   case "send_email":  return await sendEmailHandler(body);
  //   case "purchase":    return await purchaseHandler(body);

  return NextResponse.json({
    allowed: true,
    requestId: verifyResult.requestId,
    message: `Action "${body.action}" was permitted. Add your handler here.`,
  });
}
