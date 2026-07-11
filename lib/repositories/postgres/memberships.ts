import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { accountInvites, accountMemberships } from "@/lib/db/postgres/schema";
import { BILLABLE_WORKSPACE_ROLES, type WorkspaceRole } from "@/lib/authority";
import { normalizeEmail } from "@/lib/developerAuth";

type MembershipLean = {
  membershipId: string;
  accountId: string;
  userId: string;
  role: string;
  createdAt?: Date;
};

type PendingInviteLean = {
  inviteId: string;
  email: string;
  role: string;
  invitedBy: string;
  createdAt?: Date;
};

export async function countBillableSeatsByAccountId(db: BehalfPostgresDb, accountId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(accountMemberships)
    .where(
      and(
        eq(accountMemberships.accountId, accountId),
        inArray(accountMemberships.role, [...BILLABLE_WORKSPACE_ROLES])
      )
    );

  return row?.value ?? 0;
}

export async function findMembershipByAccountAndUser(
  db: BehalfPostgresDb,
  accountId: string,
  userId: string
): Promise<MembershipLean | null> {
  const row =
    (await db.query.accountMemberships.findFirst({
      where: and(
        eq(accountMemberships.accountId, accountId),
        eq(accountMemberships.userId, userId)
      )
    })) ?? null;

  if (!row) {
    return null;
  }

  return {
    membershipId: row.membershipId,
    accountId: row.accountId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt
  };
}

export async function findMembershipsByAccountId(
  db: BehalfPostgresDb,
  accountId: string
): Promise<MembershipLean[]> {
  const rows = await db.query.accountMemberships.findMany({
    where: eq(accountMemberships.accountId, accountId),
    orderBy: asc(accountMemberships.createdAt)
  });

  return rows.map((row) => ({
    membershipId: row.membershipId,
    accountId: row.accountId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt
  }));
}

export async function createMembership(
  db: BehalfPostgresDb,
  input: {
    membershipId: string;
    accountId: string;
    userId: string;
    role: WorkspaceRole;
  }
) {
  const [row] = await db
    .insert(accountMemberships)
    .values({
      membershipId: input.membershipId,
      accountId: input.accountId,
      userId: input.userId,
      role: input.role
    })
    .returning();

  return row;
}

export async function updateMembershipRole(
  db: BehalfPostgresDb,
  membershipId: string,
  accountId: string,
  role: string
) {
  return db
    .update(accountMemberships)
    .set({ role })
    .where(
      and(
        eq(accountMemberships.membershipId, membershipId),
        eq(accountMemberships.accountId, accountId)
      )
    );
}

export async function deleteMembership(
  db: BehalfPostgresDb,
  membershipId: string,
  accountId: string
) {
  return db
    .delete(accountMemberships)
    .where(
      and(
        eq(accountMemberships.membershipId, membershipId),
        eq(accountMemberships.accountId, accountId)
      )
    );
}

export async function findPendingInvitesByAccountId(
  db: BehalfPostgresDb,
  accountId: string
): Promise<PendingInviteLean[]> {
  const rows = await db.query.accountInvites.findMany({
    where: and(eq(accountInvites.accountId, accountId), eq(accountInvites.status, "pending")),
    orderBy: desc(accountInvites.createdAt)
  });

  return rows.map((row) => ({
    inviteId: row.inviteId,
    email: row.email,
    role: row.role,
    invitedBy: row.invitedBy,
    createdAt: row.createdAt
  }));
}

export async function upsertPendingInvite(
  db: BehalfPostgresDb,
  accountId: string,
  email: string,
  update: {
    role: string;
    invitedBy: string;
    inviteTokenHash: string;
    inviteTokenExpiresAt: Date;
    inviteId: string;
  }
): Promise<PendingInviteLean> {
  const normalizedEmail = normalizeEmail(email);

  const [row] = await db
    .insert(accountInvites)
    .values({
      inviteId: update.inviteId,
      accountId,
      email: normalizedEmail,
      role: update.role,
      status: "pending",
      invitedBy: update.invitedBy,
      inviteTokenHash: update.inviteTokenHash,
      inviteTokenExpiresAt: update.inviteTokenExpiresAt
    })
    .onConflictDoUpdate({
      target: [accountInvites.accountId, accountInvites.email, accountInvites.status],
      set: {
        role: update.role,
        invitedBy: update.invitedBy,
        inviteTokenHash: update.inviteTokenHash,
        inviteTokenExpiresAt: update.inviteTokenExpiresAt
      }
    })
    .returning({
      inviteId: accountInvites.inviteId,
      email: accountInvites.email,
      role: accountInvites.role,
      invitedBy: accountInvites.invitedBy,
      createdAt: accountInvites.createdAt
    });

  if (!row) {
    throw new Error("upsertPendingInvite failed to return a row");
  }

  return row;
}
