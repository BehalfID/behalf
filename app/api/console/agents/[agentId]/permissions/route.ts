import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId, getConsoleAgent } from "@/lib/consoleData";
import { createPublicId } from "@/lib/ids";
import { parsePermissionMetadata } from "@/lib/permissions";
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

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireConsoleApi(request);
  if (authError) {
    return authError;
  }

  const { agentId } = await context.params;
  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
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

  const action = readString(body.action);
  const description =
    body.description === undefined ? undefined : readString(body.description);
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

  const accountId = await getConsoleAccountId();
  const agent = await getConsoleAgent(agentId, accountId);
  if (!agent) {
    return jsonError("Agent not found.", 404);
  }

  const permission = await Permission.create({
    permissionId: createPublicId("perm"),
    accountId,
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
    createWebhookEvent(accountId, "permission.created", {
      permissionId: permission.permissionId,
      agentId,
      action
    })
  );

  return NextResponse.json(
    {
      permissionId: permission.permissionId,
      status: permission.status
    },
    { status: 201 }
  );
}
