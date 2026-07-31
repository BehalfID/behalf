/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/adaptiveDelegation";
import * as pg from "@/lib/repositories/postgres/adaptiveDelegation";
import { getPostgresDb } from "@/lib/db/postgres";
import { resolveRepositoryBackend } from "@/lib/repositories/backend";

export type { AdaptiveDelegationRecommendationLean } from "@/lib/repositories/mongo/adaptiveDelegation";

function usePostgres() {
  return resolveRepositoryBackend() === "postgres";
}

export async function createEvent(input: Record<string, unknown>) {
  if (usePostgres()) return pg.createEvent(getPostgresDb(), input);
  return mongo.createEvent(input);
}

export async function findRecommendations(
  filter: Record<string, unknown>,
  options: { select?: string; sort?: Record<string, 1 | -1>; lean?: boolean } = {}
) {
  if (usePostgres()) return pg.findRecommendations(getPostgresDb(), filter, options);
  return mongo.findRecommendations(filter, options);
}

export async function findOneRecommendation(filter: Record<string, unknown>) {
  if (usePostgres()) return pg.findOneRecommendation(getPostgresDb(), filter);
  return mongo.findOneRecommendation(filter);
}

export async function findOneAndUpdateRecommendation(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  if (usePostgres()) {
    return pg.findOneAndUpdateRecommendation(getPostgresDb(), filter, update, options);
  }
  return mongo.findOneAndUpdateRecommendation(filter, update, options);
}

export async function createRecommendation(input: Record<string, unknown>) {
  if (usePostgres()) return pg.createRecommendation(getPostgresDb(), input);
  return mongo.createRecommendation(input);
}

export async function updateRecommendations(
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  if (usePostgres()) return pg.updateRecommendations(getPostgresDb(), filter, update);
  return mongo.updateRecommendations(filter, update);
}
