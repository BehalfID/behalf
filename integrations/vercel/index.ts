/**
 * BehalfID reusable handler factory for Vercel / Next.js App Router.
 *
 * Status: DEPLOYMENT EXAMPLE — shows how to protect agent-action API routes
 * with BehalfID. Not an official Vercel integration.
 *
 * Usage: import createBehalfIDHandler and mount it as your POST route handler.
 * See integrations/vercel/example-route.ts for a full wired-up example.
 *
 * Required environment variables:
 *   BEHALFID_API_KEY   — agent API key (bhf_sk_...)
 *   BEHALFID_AGENT_ID  — agent identifier
 *
 * Optional:
 *   BEHALFID_BASE_URL  — override for self-hosted deployments
 *
 * Install: npm install @behalfid/sdk
 * Docs:    integrations/vercel/README.md
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

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

export type BehalfIDRouteConfig = {
  /** Agent API key. Falls back to process.env.BEHALFID_API_KEY. */
  apiKey?: string;
  /** Agent identifier. Falls back to process.env.BEHALFID_AGENT_ID. */
  agentId?: string;
  /** Override base URL. Defaults to https://behalfid.com. */
  baseUrl?: string;
  /**
   * Called after permission is granted. Receives the verified action and raw
   * request body. Return a Response to short-circuit default handling.
   * (NextResponse satisfies Response, so returning NextResponse.json(...) works.)
   */
  onAllowed?: (
    action: string,
    body: Record<string, unknown>,
    verifyResult: VerifyResult
  ) => Promise<Response | null>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Inline verify (no additional runtime dependency) ────────────────────────

async function verifyAction(
  apiKey: string,
  baseUrl: string,
  input: VerifyInput
): Promise<VerifyResult> {
  const response = await fetch(`${baseUrl}/api/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`BehalfID verify returned ${response.status}`);
  }

  return response.json() as Promise<VerifyResult>;
}

// ─── Core decision function (framework-agnostic) ─────────────────────────────

/**
 * Process a BehalfID permission check against a standard Web API Request.
 *
 * Returns a standard Web API Response. This function is exported for unit
 * testing without the Next.js runtime. `createBehalfIDHandler` wraps it.
 *
 * Decision rules:
 *  - Missing config           → 503
 *  - Invalid JSON body        → 400
 *  - Missing/invalid action   → 400
 *  - verify() throws          → 503 (fail-closed)
 *  - verify returns denied    → 403
 *  - verify returns allowed   → calls onAllowed, or returns 200
 */
export async function processBehalfIDRequest(
  request: Pick<Request, "json">,
  config: BehalfIDRouteConfig
): Promise<Response> {
  const apiKey = config.apiKey ?? process.env.BEHALFID_API_KEY;
  const agentId = config.agentId ?? process.env.BEHALFID_AGENT_ID;
  const baseUrl = (
    config.baseUrl ?? process.env.BEHALFID_BASE_URL ?? "https://behalfid.com"
  ).replace(/\/+$/, "");

  if (!apiKey || !agentId) {
    return jsonResponse(
      {
        error:
          "BehalfID is not configured. " +
          "Set BEHALFID_API_KEY and BEHALFID_AGENT_ID in your environment variables.",
      },
      503
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (typeof body.action !== "string" || !body.action) {
    return jsonResponse(
      { error: "action is required and must be a non-empty string." },
      400
    );
  }

  const action = body.action;

  // Fail-closed: if verify throws (network error, timeout, bad response),
  // block the action and surface the reason.
  let verifyResult: VerifyResult;
  try {
    verifyResult = await verifyAction(apiKey, baseUrl, {
      agentId,
      action,
      amount: typeof body.amount === "number" ? body.amount : undefined,
      vendor: typeof body.vendor === "string" ? body.vendor : undefined,
      resource: typeof body.resource === "string" ? body.resource : undefined,
      metadata:
        body.metadata !== null &&
        typeof body.metadata === "object" &&
        !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : undefined,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: "Permission check failed.", detail, allowed: false }, 503);
  }

  if (verifyResult.allowed !== true) {
    return jsonResponse(
      {
        allowed: false,
        reason: verifyResult.reason,
        risk: verifyResult.risk,
        requestId: verifyResult.requestId,
      },
      403
    );
  }

  // Permission granted — call the application handler if provided.
  if (config.onAllowed) {
    const custom = await config.onAllowed(action, body, verifyResult);
    if (custom !== null) return custom;
  }

  return jsonResponse({
    allowed: true,
    requestId: verifyResult.requestId,
    message: `Action "${action}" was permitted.`,
  }, 200);
}

// ─── Next.js App Router handler factory ──────────────────────────────────────

/**
 * Create a Next.js App Router POST handler with BehalfID protection.
 *
 * The handler:
 * 1. Validates configuration is present (503 if missing)
 * 2. Parses and validates the request body
 * 3. Calls BehalfID verify() — blocks on any failure (fail-closed)
 * 4. Returns 403 on denial with reason, risk, and requestId
 * 5. Calls onAllowed() if provided, or returns a default 200 with allowed: true
 *
 * @example
 * // app/api/agent-action/route.ts
 * import { createBehalfIDHandler } from "@/integrations/vercel";
 *
 * export const POST = createBehalfIDHandler({
 *   onAllowed: async (action, body, verifyResult) => {
 *     if (action === "send_email") {
 *       await sendEmail(body);
 *       return NextResponse.json({ sent: true });
 *     }
 *     return null; // fall through to default response
 *   },
 * });
 */
export function createBehalfIDHandler(config: BehalfIDRouteConfig = {}) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    const response = await processBehalfIDRequest(request, config);
    // NextResponse extends Response — safe to cast
    return response as unknown as NextResponse;
  };
}
