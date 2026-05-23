import Agent from "@/models/Agent";
import VerificationLog from "@/models/VerificationLog";

export type LogRisk = "low" | "medium" | "high";

export type VerificationLogListItem = {
  requestId: string;
  accountId?: string | null;
  developerUserId?: string | null;
  agentId: string;
  agentName?: string | null;
  permissionId?: string | null;
  action: string;
  amount?: number;
  vendor?: string | null;
  allowed: boolean;
  reason: string;
  risk: LogRisk;
  createdAt?: Date | string;
};

export type VerificationLogSummary = {
  total: number;
  allowed: number;
  denied: number;
  highRisk: number;
  approvalRequired: number;
  topDeniedAction: string | null;
  topVendor: string | null;
};

export type LogPagination = {
  limit: number;
  page: number;
  total: number;
  hasMore: boolean;
};

const RISKS = new Set(["low", "medium", "high"]);
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function redactLogString(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/bhf_sk_[A-Za-z0-9._~+/-]+=*/g, "bhf_sk_[redacted]")
    .replace(/bhf_dev_[A-Za-z0-9._~+/-]+=*/g, "bhf_dev_[redacted]")
    .replace(/bhf_pass_[A-Za-z0-9._~+/-]+=*/g, "bhf_pass_[redacted]")
    .replace(/whsec_[A-Za-z0-9._~+/-]+=*/g, "whsec_[redacted]");
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function validDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestDate(a: Date | null, b: Date | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function parseLogListParams(searchParams: URLSearchParams) {
  const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const page = parsePositiveInt(searchParams.get("page"), 1, 10000);
  return {
    limit,
    page,
    skip: (page - 1) * limit,
    format: searchParams.get("format")?.trim().toLowerCase() === "csv" ? "csv" : "json"
  };
}

export function buildVerificationLogQuery(
  searchParams: URLSearchParams,
  baseQuery: Record<string, unknown>,
  options: { retentionStart?: Date | null } = {}
) {
  const query: Record<string, unknown> = { ...baseQuery };
  const agentId = searchParams.get("agentId")?.trim() || searchParams.get("agent")?.trim();
  const action = searchParams.get("action")?.trim();
  const vendor = searchParams.get("vendor")?.trim() || searchParams.get("resource")?.trim();
  const requestId = searchParams.get("requestId")?.trim();
  const allowed = searchParams.get("allowed")?.trim();
  const risk = searchParams.get("risk")?.trim();
  const from = validDate(searchParams.get("from") ?? searchParams.get("start"));
  const to = validDate(searchParams.get("to") ?? searchParams.get("end"));
  const gte = latestDate(options.retentionStart ?? null, from);

  if (agentId && !Object.prototype.hasOwnProperty.call(baseQuery, "agentId")) {
    query.agentId = agentId;
  }
  if (action) query.action = action;
  if (vendor) query.vendor = vendor;
  if (requestId) query.requestId = requestId;
  if (allowed === "true") query.allowed = true;
  if (allowed === "false") query.allowed = false;
  if (risk && RISKS.has(risk)) query.risk = risk;
  if (gte || to) query.createdAt = {
    ...(gte ? { $gte: gte } : {}),
    ...(to ? { $lte: to } : {})
  };

  return query;
}

export function calculateVerificationLogSummary(logs: VerificationLogListItem[]): VerificationLogSummary {
  const deniedByAction = new Map<string, number>();
  const byVendor = new Map<string, number>();
  const summary: VerificationLogSummary = {
    total: logs.length,
    allowed: 0,
    denied: 0,
    highRisk: 0,
    approvalRequired: 0,
    topDeniedAction: null,
    topVendor: null
  };

  for (const log of logs) {
    if (log.allowed) summary.allowed += 1;
    else {
      summary.denied += 1;
      deniedByAction.set(log.action, (deniedByAction.get(log.action) ?? 0) + 1);
    }
    if (log.risk === "high") summary.highRisk += 1;
    if (/requires approval|approval required|approval before execution/i.test(log.reason)) {
      summary.approvalRequired += 1;
    }
    if (log.vendor) byVendor.set(log.vendor, (byVendor.get(log.vendor) ?? 0) + 1);
  }

  summary.topDeniedAction = topKey(deniedByAction);
  summary.topVendor = topKey(byVendor);
  return summary;
}

function topKey(values: Map<string, number>) {
  let top: string | null = null;
  let count = 0;
  for (const [key, value] of values) {
    if (value > count) {
      top = key;
      count = value;
    }
  }
  return top;
}

type AggFacet = {
  stats: Array<{ total: number; allowed: number; denied: number; highRisk: number; approvalRequired: number }>;
  deniedActions: Array<{ _id: string; count: number }>;
  topVendors: Array<{ _id: string; count: number }>;
};

/**
 * Compute dashboard log summary using a single MongoDB aggregation pipeline.
 * Avoids fetching up to 1000 documents to JavaScript before calculating stats.
 * Falls back to the in-process `calculateVerificationLogSummary` when aggregation
 * is not available (e.g. in tests using the in-memory driver).
 */
export async function getVerificationLogSummaryAgg(
  query: Record<string, unknown>,
  limit = 1000
): Promise<VerificationLogSummary> {
  // Fast path: single aggregation pipeline (production MongoDB).
  // Falls back to the in-process helper when .aggregate is unavailable
  // (e.g. in tests using the in-memory / mocked driver).
  if (typeof VerificationLog.aggregate === "function") {
    try {
      const result = await VerificationLog.aggregate<{
        stats: AggFacet["stats"];
        deniedActions: AggFacet["deniedActions"];
        topVendors: AggFacet["topVendors"];
      }>([
        { $match: query },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
        {
          $facet: {
            stats: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  allowed: { $sum: { $cond: ["$allowed", 1, 0] } },
                  denied: { $sum: { $cond: ["$allowed", 0, 1] } },
                  highRisk: { $sum: { $cond: [{ $eq: ["$risk", "high"] }, 1, 0] } },
                  approvalRequired: {
                    $sum: {
                      $cond: [
                        {
                          $regexMatch: {
                            input: { $ifNull: ["$reason", ""] },
                            regex: "requires approval|approval required|approval before execution",
                            options: "i"
                          }
                        },
                        1,
                        0
                      ]
                    }
                  }
                }
              }
            ],
            deniedActions: [
              { $match: { allowed: false } },
              { $group: { _id: "$action", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 1 }
            ],
            topVendors: [
              { $match: { vendor: { $ne: null, $exists: true } } },
              { $group: { _id: "$vendor", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 1 }
            ]
          }
        }
      ]);

      const facet = result[0];
      if (!facet) {
        return { total: 0, allowed: 0, denied: 0, highRisk: 0, approvalRequired: 0, topDeniedAction: null, topVendor: null };
      }
      const stats = facet.stats[0] ?? { total: 0, allowed: 0, denied: 0, highRisk: 0, approvalRequired: 0 };
      return {
        total: stats.total,
        allowed: stats.allowed,
        denied: stats.denied,
        highRisk: stats.highRisk,
        approvalRequired: stats.approvalRequired,
        topDeniedAction: facet.deniedActions[0]?._id ?? null,
        topVendor: facet.topVendors[0]?._id ?? null
      };
    } catch {
      // fall through to in-process fallback
    }
  }

  // Fallback: fetch documents and compute summary in-process.
  const logs = await VerificationLog.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<VerificationLogListItem[]>();
  return calculateVerificationLogSummary(logs);
}

export async function withAgentNames(
  logs: VerificationLogListItem[],
  scope: { developerUserId?: string; accountId?: string }
) {
  const agentIds = Array.from(new Set(logs.map((log) => log.agentId))).filter(Boolean);
  if (!agentIds.length) return logs.map(sanitizeVerificationLog);

  const query: Record<string, unknown> = { agentId: { $in: agentIds } };
  if (scope.developerUserId) query.developerUserId = scope.developerUserId;
  if (scope.accountId) query.accountId = scope.accountId;
  const agents = await Agent.find(query).select("-_id agentId name").lean();
  const names = new Map(agents.map((agent) => [agent.agentId, agent.name]));
  return logs.map((log) => sanitizeVerificationLog({ ...log, agentName: names.get(log.agentId) ?? null }));
}

export function sanitizeVerificationLog(log: VerificationLogListItem): VerificationLogListItem {
  return {
    ...log,
    requestId: redactLogString(log.requestId),
    accountId: log.accountId ? redactLogString(log.accountId) : log.accountId,
    developerUserId: log.developerUserId ? redactLogString(log.developerUserId) : log.developerUserId,
    agentId: redactLogString(log.agentId),
    agentName: log.agentName ? redactLogString(log.agentName) : log.agentName,
    permissionId: log.permissionId ? redactLogString(log.permissionId) : log.permissionId,
    action: redactLogString(log.action),
    vendor: log.vendor ? redactLogString(log.vendor) : log.vendor,
    reason: redactLogString(log.reason)
  };
}

export function logsToCsv(logs: VerificationLogListItem[]) {
  const headers = [
    "createdAt",
    "decision",
    "risk",
    "agentId",
    "agentName",
    "action",
    "vendor",
    "amount",
    "reason",
    "requestId"
  ];
  const rows = logs.map((log) => [
    stringifyDate(log.createdAt),
    log.allowed ? "allowed" : "denied",
    log.risk,
    log.agentId,
    log.agentName ?? "",
    log.action,
    log.vendor ?? "",
    log.amount ?? "",
    log.reason,
    log.requestId
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function stringifyDate(value?: Date | string) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : value;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
