import DeveloperSession from "@/models/DeveloperSession";
import { lazyModelMethod } from "@/lib/repositories/mongoModelAdapter";

export type DeveloperSessionLean = {
  _id?: unknown;
  sessionId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  lastActivityAt?: Date;
  activeAccountId?: string | null;
  createdAt?: Date;
};

export type CreateSessionInput = Pick<
  DeveloperSessionLean,
  "sessionId" | "userId" | "tokenHash" | "expiresAt" | "lastActivityAt" | "activeAccountId"
>;

export async function createSession(input: CreateSessionInput): Promise<DeveloperSessionLean> {
  const session = await DeveloperSession.create(input);
  return session.toObject() as DeveloperSessionLean;
}

export async function findByTokenHash(
  tokenHash: string,
  options?: { requireUnexpired?: boolean; select?: string }
): Promise<DeveloperSessionLean | null> {
  const filter: Record<string, unknown> = { tokenHash };
  if (options?.requireUnexpired) filter.expiresAt = { $gt: new Date() };
  const query = DeveloperSession.findOne(filter);
  if (options?.select) query.select(options.select);
  return (await query.lean()) as DeveloperSessionLean | null;
}

export async function findBySessionId(
  sessionId: string,
  options?: { userId?: string; select?: string }
): Promise<DeveloperSessionLean | null> {
  const filter: Record<string, unknown> = { sessionId };
  if (options?.userId) filter.userId = options.userId;
  const query = DeveloperSession.findOne(filter);
  if (options?.select) query.select(options.select);
  return (await query.lean()) as DeveloperSessionLean | null;
}

export function updateActivity(sessionId: string, lastActivityAt: Date, expiresAt: Date) {
  return DeveloperSession.updateOne({ sessionId }, { $set: { lastActivityAt, expiresAt } });
}

export function deleteBySessionId(sessionId: string, options?: { userId?: string }) {
  return DeveloperSession.deleteOne({ sessionId, ...(options?.userId ? { userId: options.userId } : {}) });
}

export function deleteByTokenHash(tokenHash: string) {
  return DeveloperSession.deleteOne({ tokenHash });
}

export function deleteByUserId(userId: string) {
  return DeveloperSession.deleteOne({ userId });
}

export function deleteManyByUserId(userId: string) {
  return DeveloperSession.deleteMany({ userId });
}

export function updateActiveAccountId(userId: string, sessionId: string, activeAccountId: string | null) {
  return activeAccountId
    ? DeveloperSession.updateOne({ sessionId, userId }, { $set: { activeAccountId } })
    : DeveloperSession.updateOne({ sessionId, userId }, { $unset: { activeAccountId: "" } });
}

export function clearActiveAccountIdForUserAccount(userId: string, accountId: string) {
  return DeveloperSession.updateMany(
    { userId, activeAccountId: accountId },
    { $unset: { activeAccountId: "" } }
  );
}

/** Mongo query primitives for routes that need an exact model query shape. */
export function deleteSession(filter: Record<string, unknown>) {
  return DeveloperSession.deleteOne(filter);
}

export function deleteSessions(filter: Record<string, unknown>) {
  return DeveloperSession.deleteMany(filter);
}

export const sessionRepository = {
  deleteOne: deleteSession,
  deleteMany: deleteSessions
};

export interface SessionsRepository {
  createSession: typeof createSession;
  findByTokenHash: typeof findByTokenHash;
  findBySessionId: typeof findBySessionId;
  updateActivity: typeof updateActivity;
  deleteBySessionId: typeof deleteBySessionId;
  deleteByTokenHash: typeof deleteByTokenHash;
  deleteByUserId: typeof deleteByUserId;
  deleteManyByUserId: typeof deleteManyByUserId;
  updateActiveAccountId: typeof updateActiveAccountId;
  clearActiveAccountIdForUserAccount: typeof clearActiveAccountIdForUserAccount;
}

export const findOne = lazyModelMethod(() => DeveloperSession, "findOne");
export const create = lazyModelMethod(() => DeveloperSession, "create");
export const updateOne = lazyModelMethod(() => DeveloperSession, "updateOne");
export const updateMany = lazyModelMethod(() => DeveloperSession, "updateMany");
export const deleteOne = lazyModelMethod(() => DeveloperSession, "deleteOne");
export const deleteMany = lazyModelMethod(() => DeveloperSession, "deleteMany");
