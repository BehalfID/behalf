import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/db";
import EnterpriseInquiry from "@/models/EnterpriseInquiry";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  await connectToDatabase();

  const inquiries = await EnterpriseInquiry.find()
    .sort({ createdAt: -1 })
    .select("-_id inquiryId name email company message status createdAt")
    .lean();

  return NextResponse.json({ inquiries });
}
