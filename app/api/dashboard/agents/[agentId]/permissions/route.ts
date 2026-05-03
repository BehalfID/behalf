import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { createPublicId } from "@/lib/ids";
import { jsonError } from "@/lib/responses";
import { isRecord, parseOptionalAmount, parseOptionalDate, readString, rejectUnknownFields } from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Agent from "@/models/Agent";
import Permission from "@/models/Permission";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const { agentId } = await context.params;

  const agent = await Agent.findOne({ developerUserId: auth.user.userId, agentId });
  if (!agent) return jsonError("Agent not found.", 404);

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["action", "description", "constraints"]);
  if (unknownError) return jsonError(unknownError);

  const action = readString(body.action);
  const description = body.description === undefined ? undefined : readString(body.description);
  if (!action) return jsonError("action is required.");
  if (body.description !== undefined && !description) return jsonError("description must be a non-empty string.");

  const constraints = body.constraints === undefined ? {} : body.constraints;
  if (!isRecord(constraints)) return jsonError("constraints must be an object.");

  const constraintsUnknownError = rejectUnknownFields(constraints, ["maxAmount", "allowedVendors", "expiresAt"]);
  if (constraintsUnknownError) return jsonError(constraintsUnknownError);

  const { amount: maxAmount, error: amountError } = parseOptionalAmount(constraints.maxAmount);
  if (amountError) return jsonError(amountError);

  let allowedVendors: string[] | undefined;
  if (constraints.allowedVendors !== undefined) {
    if (!Array.isArray(constraints.allowedVendors) || constraints.allowedVendors.some((vendor) => typeof vendor !== "string" || !vendor.trim())) {
      return jsonError("allowedVendors must be an array of non-empty strings.");
    }
    allowedVendors = constraints.allowedVendors.map((vendor) => vendor.trim());
  }

  const { date: expiresAt, error: dateError } = parseOptionalDate(constraints.expiresAt);
  if (dateError) return jsonError(dateError);

  const permissionId = createPublicId("perm");
  await Permission.create({
    permissionId,
    developerUserId: auth.user.userId,
    agentId,
    action,
    description,
    constraints: { maxAmount, allowedVendors, expiresAt },
    status: "active"
  });

  await emitWebhookEvent(
    createWebhookEvent(null, "permission.created", { permissionId, agentId, action }, auth.user.userId)
  );

  return NextResponse.json({ permissionId, status: "active" }, { status: 201 });
}
