import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { listEnterpriseInquiries } from "@/lib/repositories/enterpriseInquiries";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  const inquiries = await listEnterpriseInquiries();

  return NextResponse.json({ inquiries });
}
