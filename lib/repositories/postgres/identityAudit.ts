import { desc, eq } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { identityAuditLogs } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";

export type IdentityAuditAction =
  | "identity_linked"
  | "identity_unlinked"
  | "identity_registered"
  | "identity_login"
  | "identity_link_rejected"
  | "password_login"
  | "passkey_registered"
  | "passkey_renamed"
  | "passkey_removed"
  | "method_removal_rejected"
  | "account_deletion_reauth_started"
  | "account_deletion_reauth_succeeded"
  | "account_deletion_reauth_failed"
  | "account_deletion_completed"
  | "account_deletion_blocked";

export type IdentityAuditProvider = "github" | "google" | "password" | "passkey";

export type IdentityAuditLogLean = {
  entryId: string;
  userId: string;
  action: IdentityAuditAction;
  provider: IdentityAuditProvider;
  providerAccountId: string;
  providerUsername: string | null;
  ipHash: string | null;
  context: string | null;
  createdAt: Date;
};

export type CreateIdentityAuditInput = {
  entryId: string;
  userId: string;
  action: IdentityAuditAction;
  provider: IdentityAuditProvider;
  providerAccountId: string;
  providerUsername?: string | null;
  ipHash?: string | null;
  context?: string | null;
};

type AuditRow = typeof identityAuditLogs.$inferSelect;

function toLean(row: AuditRow): IdentityAuditLogLean {
  return {
    entryId: row.entryId,
    userId: row.userId,
    action: row.action as IdentityAuditAction,
    provider: row.provider as IdentityAuditProvider,
    providerAccountId: row.providerAccountId,
    providerUsername: row.providerUsername ?? null,
    ipHash: row.ipHash ?? null,
    context: row.context ?? null,
    createdAt: row.createdAt
  };
}

export async function createIdentityAuditLog(
  db: BehalfPostgresDb,
  input: CreateIdentityAuditInput
): Promise<IdentityAuditLogLean> {
  try {
    const [row] = await db
      .insert(identityAuditLogs)
      .values({
        entryId: input.entryId,
        userId: input.userId,
        action: input.action,
        provider: input.provider,
        providerAccountId: input.providerAccountId.slice(0, 120),
        providerUsername: input.providerUsername ?? null,
        ipHash: input.ipHash ?? null,
        context: input.context ?? null
      })
      .returning();
    if (!row) throw new Error("createIdentityAuditLog failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function listIdentityAuditLogs(
  db: BehalfPostgresDb,
  userId: string,
  limit = 25
): Promise<
  Array<
    Pick<
      IdentityAuditLogLean,
      "entryId" | "action" | "provider" | "providerUsername" | "context" | "createdAt"
    >
  >
> {
  const capped = Math.min(Math.max(limit, 1), 100);
  const rows = await db
    .select({
      entryId: identityAuditLogs.entryId,
      action: identityAuditLogs.action,
      provider: identityAuditLogs.provider,
      providerUsername: identityAuditLogs.providerUsername,
      context: identityAuditLogs.context,
      createdAt: identityAuditLogs.createdAt
    })
    .from(identityAuditLogs)
    .where(eq(identityAuditLogs.userId, userId))
    .orderBy(desc(identityAuditLogs.createdAt))
    .limit(capped);

  return rows.map((row) => ({
    entryId: row.entryId,
    action: row.action as IdentityAuditAction,
    provider: row.provider as IdentityAuditProvider,
    providerUsername: row.providerUsername ?? null,
    context: row.context ?? null,
    createdAt: row.createdAt
  }));
}
