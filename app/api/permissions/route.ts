import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { createPublicId } from "@/lib/ids";
import { jsonError } from "@/lib/responses";
import {
  isRecord,
  parseOptionalAmount,
  parseOptionalDate,
  readString,
  rejectUnknownFields
} from "@/lib/validation";
import Permission from "@/models/Permission";

export async function POST(request: NextRequest) {
  await connectToDatabase();

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return jsonError("Request body must be a JSON object.");
  }

  const unknownError = rejectUnknownFields(body, ["agentId", "action", "constraints"]);
  if (unknownError) {
    return jsonError(unknownError);
  }

  const agentId = readString(body.agentId);
  const action = readString(body.action);

  if (!agentId) {
    return jsonError("agentId is required.");
  }

  if (!action) {
    return jsonError("action is required.");
  }

  const auth = await authenticateAgent(request, agentId);
  if (auth.error) {
    return jsonError(auth.error, auth.error === "Unknown agent." ? 404 : 401);
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
    agentId,
    action,
    constraints: {
      maxAmount,
      allowedVendors,
      expiresAt
    },
    status: "active"
  });

  return NextResponse.json({ permissionId, status: "active" }, { status: 201 });
}
