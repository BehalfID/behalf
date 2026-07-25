import Agent from "@/models/Agent";
import VerificationLog, { type VerificationLogDocument } from "@/models/VerificationLog";
import type { PipelineStage } from "mongoose";
import { lazyModelMethod } from "@/lib/repositories/mongoModelAdapter";

export type VerificationLogLean = VerificationLogDocument;
export type VerificationLogRepository = typeof verificationLogRepository;

type AggregateStats = {
  total: number;
  allowed: number;
  denied: number;
  highRisk: number;
  approvalRequired: number;
  topDeniedAction: string | null;
  topVendor: string | null;
};

export async function createLog(input: Partial<VerificationLogDocument>) {
  return VerificationLog.create(input);
}

export function findLogs(
  filter: Record<string, unknown>,
  options: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number; select?: string } = {}
) {
  const query = VerificationLog.find(filter).sort(options.sort ?? { createdAt: -1 });
  if (options.select) query.select(options.select);
  if (options.skip) query.skip(options.skip);
  if (options.limit) query.limit(options.limit);
  return query;
}

export function findOneLog(filter: Record<string, unknown>) {
  return VerificationLog.findOne(filter);
}

export async function countLogs(filter: Record<string, unknown>) {
  return VerificationLog.countDocuments(filter);
}

export async function aggregateStats(query: Record<string, unknown>, limit = 1000): Promise<AggregateStats | null> {
  if (typeof VerificationLog.aggregate !== "function") return null;
  try {
    const result = await VerificationLog.aggregate<{
      stats: Array<{ total: number; allowed: number; denied: number; highRisk: number; approvalRequired: number }>;
      deniedActions: Array<{ _id: string }>;
      topVendors: Array<{ _id: string }>;
    }>([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      {
        $facet: {
          stats: [{
            $group: {
              _id: null,
              total: { $sum: 1 },
              allowed: { $sum: { $cond: ["$allowed", 1, 0] } },
              denied: { $sum: { $cond: ["$allowed", 0, 1] } },
              highRisk: { $sum: { $cond: [{ $eq: ["$risk", "high"] }, 1, 0] } },
              approvalRequired: {
                $sum: {
                  $cond: [{
                    $or: [
                      { $eq: ["$approvalRequired", true] },
                      {
                        $regexMatch: {
                          input: { $ifNull: ["$reason", ""] },
                          regex: "requires approval|approval required|approval before execution",
                          options: "i"
                        }
                      }
                    ]
                  }, 1, 0]
                }
              }
            }
          }],
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
    const raw = facet?.stats[0] ?? {
      total: 0,
      allowed: 0,
      denied: 0,
      highRisk: 0,
      approvalRequired: 0
    };
    return {
      ...raw,
      topDeniedAction: facet?.deniedActions[0]?._id ?? null,
      topVendor: facet?.topVendors[0]?._id ?? null
    };
  } catch {
    return null;
  }
}

export async function findAgentNames(
  agentIds: string[],
  scope: { developerUserId?: string; accountId?: string }
) {
  const query: Record<string, unknown> = { agentId: { $in: agentIds } };
  if (scope.developerUserId) query.developerUserId = scope.developerUserId;
  if (scope.accountId) query.accountId = scope.accountId;
  return Agent.find(query).select("-_id agentId name").lean();
}

export async function updateLogs(filter: Record<string, unknown>, update: Record<string, unknown>) {
  return VerificationLog.updateMany(filter, update);
}

export async function deleteLogs(filter: Record<string, unknown>) {
  return VerificationLog.deleteMany(filter);
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function findOneVerificationLog(filter: Record<string, unknown>) {
  return VerificationLog.findOne(filter);
}

export function findVerificationLogs(filter: Record<string, unknown> = {}) {
  return VerificationLog.find(filter);
}

export function aggregateVerificationLogs(pipeline: PipelineStage[]) {
  return VerificationLog.aggregate(pipeline);
}

export const verificationLogRepository = {
  createLog,
  find: findVerificationLogs,
  findOne: findOneVerificationLog,
  countDocuments: countLogs,
  aggregate: aggregateVerificationLogs,
  aggregateStats,
  findAgentNames,
  updateMany: updateLogs,
  deleteMany: deleteLogs
};

export const find = lazyModelMethod(() => VerificationLog, "find");
export const create = lazyModelMethod(() => VerificationLog, "create");
export const updateMany = lazyModelMethod(() => VerificationLog, "updateMany");
export const deleteMany = lazyModelMethod(() => VerificationLog, "deleteMany");
export const countDocuments = lazyModelMethod(() => VerificationLog, "countDocuments");
