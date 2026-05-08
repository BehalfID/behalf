import { NextResponse, type NextRequest } from "next/server";
import { hashApiKey, timingSafeEqualString } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import { isRecord, parseOptionalAmount, readString, rejectUnknownFields } from "@/lib/validation";
import { previewVerification } from "@/lib/verify";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";

const PASSPORT_VERSION = "2026-05-03";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

function readPassportToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme === "Bearer" && token?.startsWith("bhf_pass_")) return token;
  return "";
}

async function authenticatePassport(agentId: string, token: string) {
  if (!token || !token.startsWith("bhf_pass_")) return null;
  await connectToDatabase();
  const agent = await Agent.findOne({ agentId, publicPassportEnabled: true })
    .select("+publicPassportTokenHash agentId name agentType provider connectionStatus description status publicPassportEnabled")
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
  connectionStatus?: string | null;
  description?: string | null;
}) {
  return {
    agentId: agent.agentId,
    name: agent.name,
    agentType: agent.agentType ?? "native",
    provider: agent.provider ?? "custom",
    connectionStatus: agent.connectionStatus ?? "manual",
    description: agent.description ?? null
  };
}

type LeanPermission = {
  action: string;
  resource?: string | null;
  scope?: string | null;
  description?: string | null;
  allowedActions?: string[];
  blockedActions?: string[];
  requiresApproval?: boolean | null;
  notes?: string | null;
  template?: string | null;
  constraints?: { maxAmount?: number | null; expiresAt?: Date | null } | null;
  status?: string;
};

function safePermission(p: LeanPermission) {
  return {
    action: p.action,
    resource: p.resource ?? null,
    scope: p.scope ?? null,
    description: p.description ?? null,
    allowedActions: p.allowedActions?.length ? [...p.allowedActions] : null,
    blockedActions: p.blockedActions?.length ? [...p.blockedActions] : null,
    requiresApproval: p.requiresApproval ?? null,
    notes: p.notes ?? null,
    template: p.template ?? null,
    maxAmount: p.constraints?.maxAmount ?? null,
    expiresAt: p.constraints?.expiresAt ? new Date(p.constraints.expiresAt).toISOString() : null,
    status: p.status ?? "active"
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const { agentId } = await context.params;
  const token = readPassportToken(request);
  const agent = await authenticatePassport(agentId, token);
  if (!agent) return jsonError("Invalid passport link.", 401);

  const rawPermissions = (await Permission.find({ agentId, status: "active" })
    .select("action resource scope description allowedActions blockedActions requiresApproval notes template constraints status -_id")
    .lean()) as LeanPermission[];

  const now = new Date();
  const activePermissions = rawPermissions
    .filter((p) => !p.constraints?.expiresAt || new Date(p.constraints.expiresAt) > now)
    .map(safePermission);

  return NextResponse.json({
    passportVersion: PASSPORT_VERSION,
    mode: "manual",
    agent: safeAgent(agent),
    permissions: activePermissions,
    limitations: [
      "Manual mode does not directly control third-party agents.",
      "Automatic enforcement requires API or SDK integration."
    ]
  });
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
  const unknownError = rejectUnknownFields(body, ["action", "vendor", "resource", "amount", "context"]);
  if (unknownError) return jsonError(unknownError);

  const action = readString(body.action);
  const vendor = body.vendor === undefined ? readString(body.resource) || undefined : readString(body.vendor);
  if (!action) return jsonError("action is required.");
  if ((body.vendor !== undefined || body.resource !== undefined) && !vendor) return jsonError("resource must be a non-empty string.");

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
