import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey, timingSafeEqualString } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import { isRecord, parseOptionalAmount, readString, rejectUnknownFields } from "@/lib/validation";
import { previewVerification } from "@/lib/verify";
import Agent from "@/models/Agent";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

function readPassportToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme === "Bearer" && token?.startsWith("bhf_pass_")) return token;
  return request.nextUrl.searchParams.get("token") ?? "";
}

async function authenticatePassport(agentId: string, token: string) {
  if (!token || !token.startsWith("bhf_pass_")) return null;
  await connectToDatabase();
  const agent = await Agent.findOne({ agentId, publicPassportEnabled: true })
    .select("+publicPassportTokenHash agentId name agentType provider description status publicPassportEnabled")
    .lean();
  if (!agent?.publicPassportTokenHash) return null;
  const tokenHash = hashApiKey(token);
  return timingSafeEqualString(tokenHash, agent.publicPassportTokenHash) ? agent : null;
}

function safeAgent(agent: {
  agentId: string;
  name: string;
  agentType?: string | null;
  provider?: string | null;
  description?: string | null;
}) {
  return {
    agentId: agent.agentId,
    name: agent.name,
    agentType: agent.agentType ?? "native",
    provider: agent.provider ?? "custom",
    description: agent.description ?? null
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const { agentId } = await context.params;
  const token = readPassportToken(request);
  const agent = await authenticatePassport(agentId, token);
  if (!agent) return jsonError("Invalid passport link.", 401);

  return NextResponse.json({ agent: safeAgent(agent) });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const { agentId } = await context.params;
  const token = readPassportToken(request);
  const agent = await authenticatePassport(agentId, token);
  if (!agent) return jsonError("Invalid passport link.", 401);

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["action", "vendor", "amount"]);
  if (unknownError) return jsonError(unknownError);

  const action = readString(body.action);
  const vendor = body.vendor === undefined ? undefined : readString(body.vendor);
  if (!action) return jsonError("action is required.");
  if (body.vendor !== undefined && !vendor) return jsonError("vendor must be a non-empty string.");

  const { amount, error: amountError } = parseOptionalAmount(body.amount);
  if (amountError) return jsonError(amountError);

  const decision = await previewVerification({
    agentId,
    agentStatus: agent.status,
    action,
    amount,
    vendor
  });

  return NextResponse.json({
    requestId: decision.requestId,
    allowed: decision.allowed,
    reason: decision.reason,
    risk: decision.risk
  });
}
