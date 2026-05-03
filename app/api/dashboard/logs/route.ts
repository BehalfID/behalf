import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import VerificationLog from "@/models/VerificationLog";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  const agentId = request.nextUrl.searchParams.get("agentId")?.trim();
  const allowed = request.nextUrl.searchParams.get("allowed");
  const risk = request.nextUrl.searchParams.get("risk")?.trim();
  const query: Record<string, unknown> = { developerUserId: auth.user.userId };
  if (agentId) query.agentId = agentId;
  if (allowed === "true") query.allowed = true;
  if (allowed === "false") query.allowed = false;
  if (risk && ["low", "medium", "high"].includes(risk)) query.risk = risk;

  const logs = await VerificationLog.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .select("-_id requestId agentId permissionId action amount vendor allowed reason risk createdAt")
    .lean();

  return NextResponse.json({ logs });
}
