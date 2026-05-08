import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { createPublicId } from "@/lib/ids";
import { parsePermissionMetadata } from "@/lib/permissions";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import {
  isRecord,
  parseOptionalAmount,
  parseOptionalDate,
  readString,
  rejectUnknownFields
} from "@/lib/validation";
import { createWebhookEvent, emitWebhookEvent } from "@/lib/webhooks";
import Permission from "@/models/Permission";

export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) {
    return rateLimitError();
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "agentId",
    "action",
    "description",
    "resource",
    "scope",
    "allowedActions",
    "blockedActions",
    "requiresApproval",
    "notes",
    "template",
    "constraints"
  ]);
  if (unknownError) {
    return jsonError(unknownError);
  }

  const agentId = readString(body.agentId);
  const action = readString(body.action);
  const description =
    body.description === undefined ? undefined : readString(body.description);

  if (!agentId) {
    return jsonError("agentId is required.");
  }

  if (!action) {
    return jsonError("action is required.");
  }

  if (body.description !== undefined && !description) {
    return jsonError("description must be a non-empty string.");
  }

  const { metadata, error: metadataError } = parsePermissionMetadata(body);
  if (metadataError || !metadata) {
    return jsonError(metadataError ?? "Invalid permission metadata.");
  }

  await connectToDatabase();

  const auth = await authenticateAgent(request, agentId);
  if (auth.error || !auth.agent) {
    return jsonError(auth.error, auth.error === "Unknown agent." ? 404 : 401);
  }

  const limit = await checkRateLimit(request, auth.agent.apiKeyHash);
  if (limit.limited) {
    return rateLimitError();
  }

  const constraints = body.constraints === undefined ? {} : body.constraints;
  if (!isRecord(constraints)) {
    return jsonError("constraints must be an object.");
  }

  const constraintsUnknownError = rejectUnknownFields(constraints, [
    "maxAmount",
    "allowedVendors",
    "expiresAt"
  ]);
  if (constraintsUnknownError) {
    return jsonError(constraintsUnknownError);
  }

  const { amount: maxAmount, error: amountError } = parseOptionalAmount(
    constraints.maxAmount
  );
  if (amountError) {
    return jsonError(amountError);
  }

  let allowedVendors: string[] | undefined;
  if (constraints.allowedVendors !== undefined) {
    if (
      !Array.isArray(constraints.allowedVendors) ||
      constraints.allowedVendors.some((vendor) => typeof vendor !== "string" || !vendor.trim())
    ) {
      return jsonError("allowedVendors must be an array of non-empty strings.");
    }

    allowedVendors = constraints.allowedVendors.map((vendor) => vendor.trim());
  }

  const { date: expiresAt, error: dateError } = parseOptionalDate(constraints.expiresAt);
  if (dateError) {
    return jsonError(dateError);
  }

  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return jsonError("expiresAt must be in the future.");
  }

  const permissionId = createPublicId("perm");

  await Permission.create({
    permissionId,
    accountId: auth.agent.accountId,
    developerUserId: auth.agent.developerUserId,
    agentId,
    action,
    description,
    ...metadata,
    constraints: {
      maxAmount,
      allowedVendors,
      expiresAt
    },
    status: "active"
  });

  await emitWebhookEvent(
    createWebhookEvent(auth.agent.accountId, "permission.created", {
      permissionId,
      agentId,
      action
    }, auth.agent.developerUserId)
  );

  return NextResponse.json({ permissionId, status: "active" }, { status: 201 });
}
