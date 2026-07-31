import { NextResponse, type NextRequest } from "next/server";
import { requireConsoleApi } from "@/lib/adminAuth";
import { getConsoleAccountId } from "@/lib/consoleData";
import { findSites } from "@/lib/repositories/sites";

export async function GET(request: NextRequest) {
  const authError = await requireConsoleApi(request);
  if (authError) return authError;

  const accountId = await getConsoleAccountId();
  const sites = await findSites({ accountId }, { sort: { createdAt: -1 }, limit: 100, select: "-_id siteId developerUserId name domain status createdAt updatedAt" });

  return NextResponse.json({ sites });
}
