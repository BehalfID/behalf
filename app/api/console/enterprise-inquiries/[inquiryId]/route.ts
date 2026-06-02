import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";
import { isRecord, readString } from "@/lib/validation";
import { jsonError } from "@/lib/responses";
import EnterpriseInquiry from "@/models/EnterpriseInquiry";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { inquiryId: string } }
) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  if (!isRecord(body)) return jsonError("Request body must be a JSON object.", 400);

  const status = readString(body.status);
  if (!status || !["new", "reviewed"].includes(status)) {
    return jsonError("status must be 'new' or 'reviewed'.", 400);
  }

  await connectToDatabase();

  const inquiry = await EnterpriseInquiry.findOneAndUpdate(
    { inquiryId: params.inquiryId },
    { $set: { status } },
    { new: true }
  ).select("-_id inquiryId name email company message status createdAt").lean();

  if (!inquiry) return jsonError("Inquiry not found.", 404);

  return NextResponse.json({ inquiry });
}
