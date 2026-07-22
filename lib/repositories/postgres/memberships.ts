import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { accountInvites, accountMemberships } from "@/lib/db/postgres/schema";
import { BILLABLE_WORKSPACE_ROLES, type WorkspaceRole } from "@/lib/authority";
import { normalizeEmail } from "@/lib/developerAuth";
import {
  DuplicateKeyError,
  translatePostgresError
} from "@/lib/repositories/errors";

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

function toMembershipLean(row: typeof accountMemberships.$inferSelect): MembershipLean {
  return {
    membershipId: row.membershipId,
    accountId: row.accountId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt
  };
}

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

  return row ? toMembershipLean(row) : null;
}

export async function findMembershipByUserAndAccount(
  db: BehalfPostgresDb,
  userId: string,
  accountId: string
): Promise<MembershipLean | null> {
  return findMembershipByAccountAndUser(db, accountId, userId);
}

export async function findMembershipsByAccountId(
  db: BehalfPostgresDb,
  accountId: string
): Promise<MembershipLean[]> {
  const rows = await db.query.accountMemberships.findMany({
    where: eq(accountMemberships.accountId, accountId),
    orderBy: asc(accountMemberships.createdAt)
  });

  return rows.map(toMembershipLean);
}

export async function findMembershipsByUserId(
  db: BehalfPostgresDb,
  userId: string
): Promise<MembershipLean[]> {
  const rows = await db.query.accountMemberships.findMany({
    where: eq(accountMemberships.userId, userId),
    orderBy: asc(accountMemberships.createdAt)
  });
  return rows.map(toMembershipLean);
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
  try {
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
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function ensureOwnerMembership(
  db: BehalfPostgresDb,
  userId: string,
  accountId: string,
  membershipId: string
): Promise<MembershipLean | null> {
  try {
    const [row] = await db
      .insert(accountMemberships)
      .values({
        membershipId,
        userId,
        accountId,
        role: "OWNER"
      })
      .onConflictDoNothing({
        target: [accountMemberships.accountId, accountMemberships.userId]
      })
      .returning();
    if (row) return toMembershipLean(row);
    return findMembershipByUserAndAccount(db, userId, accountId);
  } catch (error) {
    try {
      translatePostgresError(error);
    } catch (translated) {
      if (translated instanceof DuplicateKeyError) {
        return findMembershipByUserAndAccount(db, userId, accountId);
      }
      throw translated;
    }
  }
}

export async function createMembershipOrFindExisting(
  db: BehalfPostgresDb,
  input: {
    membershipId: string;
    accountId: string;
    userId: string;
    role: WorkspaceRole;
  }
): Promise<MembershipLean> {
  try {
    const [row] = await db
      .insert(accountMemberships)
      .values({
        membershipId: input.membershipId,
        accountId: input.accountId,
        userId: input.userId,
        role: input.role
      })
      .returning();
    if (!row) throw new Error("createMembershipOrFindExisting failed to return a row");
    return toMembershipLean(row);
  } catch (error) {
    try {
      translatePostgresError(error);
    } catch (translated) {
      if (translated instanceof DuplicateKeyError) {
        const existing = await findMembershipByAccountAndUser(db, input.accountId, input.userId);
        if (existing) return existing;
      }
      throw translated;
    }
  }
}

export async function updateMembershipRole(
  db: BehalfPostgresDb,
  membershipId: string,
  accountId: string,
  role: string
) {
  return db
    .update(accountMemberships)
    .set({ role, updatedAt: new Date() })
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

export async function deleteMembershipById(db: BehalfPostgresDb, membershipId: string) {
  const rows = await db
    .delete(accountMemberships)
    .where(eq(accountMemberships.membershipId, membershipId))
    .returning({ membershipId: accountMemberships.membershipId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function deleteMembershipsByAccountId(db: BehalfPostgresDb, accountId: string) {
  const rows = await db
    .delete(accountMemberships)
    .where(eq(accountMemberships.accountId, accountId))
    .returning({ membershipId: accountMemberships.membershipId });
  return { acknowledged: true, deletedCount: rows.length };
}

export async function countMembershipsByAccountExcludingUser(
  db: BehalfPostgresDb,
  accountId: string,
  userId: string
) {
  const [row] = await db
    .select({ value: count() })
    .from(accountMemberships)
    .where(and(eq(accountMemberships.accountId, accountId), ne(accountMemberships.userId, userId)));
  return row?.value ?? 0;
}

export async function findInviteByTokenHash(db: BehalfPostgresDb, tokenHash: string) {
  return (
    (await db.query.accountInvites.findFirst({
      where: eq(accountInvites.inviteTokenHash, tokenHash)
    })) ?? null
  );
}

export async function acceptInvite(db: BehalfPostgresDb, inviteId: string, userId: string) {
  const rows = await db
    .update(accountInvites)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      acceptedByUserId: userId,
      updatedAt: new Date()
    })
    .where(and(eq(accountInvites.inviteId, inviteId), eq(accountInvites.status, "pending")))
    .returning({ inviteId: accountInvites.inviteId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function revokeInvite(db: BehalfPostgresDb, accountId: string, inviteId: string) {
  const rows = await db
    .update(accountInvites)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(
      and(
        eq(accountInvites.inviteId, inviteId),
        eq(accountInvites.accountId, accountId),
        eq(accountInvites.status, "pending")
      )
    )
    .returning({ inviteId: accountInvites.inviteId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function markInviteAccepted(
  db: BehalfPostgresDb,
  inviteId: string,
  userId: string,
  options?: { pendingOnly?: boolean }
) {
  const pendingOnly = options?.pendingOnly !== false;
  const rows = await db
    .update(accountInvites)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      acceptedByUserId: userId,
      updatedAt: new Date()
    })
    .where(
      pendingOnly
        ? and(eq(accountInvites.inviteId, inviteId), eq(accountInvites.status, "pending"))
        : eq(accountInvites.inviteId, inviteId)
    )
    .returning({ inviteId: accountInvites.inviteId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
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

  try {
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
          inviteTokenExpiresAt: update.inviteTokenExpiresAt,
          updatedAt: new Date()
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
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function deleteInvitesByAccountId(db: BehalfPostgresDb, accountId: string) {
  const rows = await db
    .delete(accountInvites)
    .where(eq(accountInvites.accountId, accountId))
    .returning({ inviteId: accountInvites.inviteId });
  return { acknowledged: true, deletedCount: rows.length };
}
