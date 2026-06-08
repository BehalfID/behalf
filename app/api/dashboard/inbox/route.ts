import { type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { noCacheJson } from "@/lib/responses";
import Agent from "@/models/Agent";
import ApprovalRequest from "@/models/ApprovalRequest";
import VerificationLog from "@/models/VerificationLog";

const DENIED_HIGH_RISK_WINDOW_MS = 48 * 60 * 60 * 1_000;

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const userId = auth.user.userId;
  const since = new Date(Date.now() - DENIED_HIGH_RISK_WINDOW_MS);

  const [rawApprovals, rawDenied] = await Promise.all([
    ApprovalRequest.find({
      developerUserId: userId,
      status: { $in: ["pending", "approved"] }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-_id approvalId requestId agentId permissionId action vendor amount status resolvedBy resolvedAt grantExpiresAt createdAt")
      .lean(),
    VerificationLog.find({
      developerUserId: userId,
      allowed: false,
      risk: "high",
      createdAt: { $gte: since }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-_id requestId agentId permissionId action vendor amount allowed approvalRequired reason risk metadata createdAt")
      .lean()
  ]);

  const agentIds = [
    ...new Set([
      ...rawApprovals.map((a) => a.agentId),
      ...rawDenied.map((d) => d.agentId)
    ])
  ];
  const agents = agentIds.length
    ? await Agent.find({ developerUserId: userId, agentId: { $in: agentIds } })
        .select("-_id agentId name")
        .lean()
    : [];
  const nameMap = new Map(agents.map((a) => [a.agentId, a.name]));

  // Pending first, then approved; each group sorted newest-first
  const sortedApprovals = [...rawApprovals].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime();
  });

  const pendingApprovals = sortedApprovals.map((a) => ({
    ...a,
    agentName: nameMap.get(a.agentId) ?? null
  }));

  const deniedHighRisk = rawDenied.map((d) => ({
    ...d,
    agentName: nameMap.get(d.agentId) ?? null
  }));

  return noCacheJson({ pendingApprovals, deniedHighRisk });
}
