import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { getDashboardSummary } from "@/lib/dashboardData";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  return NextResponse.json(await getDashboardSummary(auth.user.userId, auth.account));
}
