import { and, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import {
  adaptiveDelegationEvents,
  adaptiveDelegationRecommendations
} from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type { AdaptiveDelegationRecommendationLean } from "@/lib/repositories/mongo/adaptiveDelegation";

type RecRow = typeof adaptiveDelegationRecommendations.$inferSelect;
type RecInsert = typeof adaptiveDelegationRecommendations.$inferInsert;

function toLean(row: RecRow): AdaptiveDelegationRecommendationLean {
  return {
    recommendationId: row.recommendationId,
    accountId: row.accountId,
    agentId: row.agentId,
    kind: row.kind,
    status: row.status,
    action: row.action,
    resource: row.resource,
    confidence: row.confidence,
    explanation: row.explanation,
    factors: row.factors,
    evidence: row.evidence,
    proposedPermission: row.proposedPermission as AdaptiveDelegationRecommendationLean["proposedPermission"],
    proposedTrustProfile: row.proposedTrustProfile as AdaptiveDelegationRecommendationLean["proposedTrustProfile"],
    proposedOrgDelegation: row.proposedOrgDelegation as AdaptiveDelegationRecommendationLean["proposedOrgDelegation"],
    affectedTools: row.affectedTools,
    affectedResources: row.affectedResources,
    estimatedApprovalReduction: row.estimatedApprovalReduction,
    securityImpact: row.securityImpact,
    rollbackInstructions: row.rollbackInstructions,
    fingerprint: row.fingerprint,
    dismissReason: row.dismissReason,
    remindAt: row.remindAt,
    acceptedPermissionId: row.acceptedPermissionId,
    acceptedProfileId: row.acceptedProfileId,
    acceptedAgentIds: row.acceptedAgentIds,
    acceptedBy: row.acceptedBy,
    dismissedBy: row.dismissedBy,
    viewedAt: row.viewedAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function buildWhere(filter: Record<string, unknown>): SQL | undefined {
  const conditions: SQL[] = [];
  for (const [key, value] of Object.entries(filter)) {
    const column = (adaptiveDelegationRecommendations as unknown as Record<string, unknown>)[key];
    if (!column || typeof column !== "object") {
      throw new Error(`Unsupported adaptive delegation filter field: ${key}`);
    }
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      const ops = value as Record<string, unknown>;
      if ("$in" in ops) {
        conditions.push(inArray(column as never, ops.$in as unknown[]));
        continue;
      }
      if ("$nin" in ops) {
        conditions.push(sql`${column as never} <> ALL(${ops.$nin as unknown[]})`);
        continue;
      }
      if ("$ne" in ops) {
        conditions.push(
          ops.$ne === null
            ? sql`${column as never} IS NOT NULL`
            : ne(column as never, ops.$ne as never)
        );
        continue;
      }
    }
    if (value === null) {
      conditions.push(isNull(column as never));
    } else {
      conditions.push(eq(column as never, value as never));
    }
  }
  return conditions.length ? and(...conditions) : undefined;
}

export async function createEvent(db: BehalfPostgresDb, input: Record<string, unknown>) {
  try {
    const [row] = await db
      .insert(adaptiveDelegationEvents)
      .values({
        eventId: String(input.eventId),
        accountId: String(input.accountId),
        recommendationId: String(input.recommendationId),
        actorUserId: (input.actorUserId as string | null | undefined) ?? null,
        type: String(input.type),
        metadata: (input.metadata as Record<string, unknown> | null | undefined) ?? null
      })
      .returning();
    return row;
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findRecommendations(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  _options: { select?: string; sort?: Record<string, 1 | -1>; lean?: boolean } = {}
) {
  const rows = await db
    .select()
    .from(adaptiveDelegationRecommendations)
    .where(buildWhere(filter))
    .orderBy(desc(adaptiveDelegationRecommendations.confidence));
  return rows.map(toLean);
}

export async function findOneRecommendation(db: BehalfPostgresDb, filter: Record<string, unknown>) {
  const [row] = await db
    .select()
    .from(adaptiveDelegationRecommendations)
    .where(buildWhere(filter))
    .limit(1);
  return row ? toLean(row) : null;
}

export async function findOneAndUpdateRecommendation(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  const set =
    update.$set && typeof update.$set === "object"
      ? ({ ...(update.$set as object), updatedAt: new Date() } as Partial<RecInsert>)
      : ({ ...update, updatedAt: new Date() } as Partial<RecInsert>);

  const [before] = await db
    .select()
    .from(adaptiveDelegationRecommendations)
    .where(buildWhere(filter))
    .limit(1);
  if (!before) return null;

  const [after] = await db
    .update(adaptiveDelegationRecommendations)
    .set(set)
    .where(eq(adaptiveDelegationRecommendations.recommendationId, before.recommendationId))
    .returning();

  const row = options.new === true || options.returnDocument === "after" ? after : before;
  return row ? toLean(row) : null;
}

export async function createRecommendation(db: BehalfPostgresDb, input: Record<string, unknown>) {
  try {
    const [row] = await db
      .insert(adaptiveDelegationRecommendations)
      .values(input as RecInsert)
      .returning();
    if (!row) throw new Error("createRecommendation failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function updateRecommendations(
  db: BehalfPostgresDb,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  const set =
    update.$set && typeof update.$set === "object"
      ? ({ ...(update.$set as object), updatedAt: new Date() } as Partial<RecInsert>)
      : ({ ...update, updatedAt: new Date() } as Partial<RecInsert>);
  const rows = await db
    .update(adaptiveDelegationRecommendations)
    .set(set)
    .where(buildWhere(filter))
    .returning({ recommendationId: adaptiveDelegationRecommendations.recommendationId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}
