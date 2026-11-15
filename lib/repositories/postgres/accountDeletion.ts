import { and, count, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import {
  accountInvites,
  accountMemberships,
  accounts,
  agents,
  approvalRequests,
  cliAuditActivities,
  cliPauseLeases,
  collaborationMessageRefs,
  developerApiTokens,
  developerSessions,
  developerUsers,
  identityAuditLogs,
  integrationBindings,
  managedProfilePolicies,
  managedProfileProtectedRepos,
  permissionProfiles,
  permissions,
  policyDocuments,
  siteAccessLogs,
  siteAccessRules,
  siteGuardKeys,
  sites,
  verificationLogs,
  webhookDeliveries,
  webhookEndpoints,
  webhookEvents
} from "@/lib/db/postgres/schema";

export async function findDeveloperUserForDeletion(db: BehalfPostgresDb, userId: string) {
  return (
    (await db.query.developerUsers.findFirst({
      where: eq(developerUsers.userId, userId)
    })) ?? null
  );
}

export async function findMembershipsForDeletion(db: BehalfPostgresDb, userId: string) {
  return db.query.accountMemberships.findMany({
    where: eq(accountMemberships.userId, userId)
  });
}

export async function countOtherMemberships(
  db: BehalfPostgresDb,
  accountId: string,
  userId: string
) {
  const [row] = await db
    .select({ value: count() })
    .from(accountMemberships)
    .where(
      and(
        eq(accountMemberships.accountId, accountId),
        ne(accountMemberships.userId, userId)
      )
    );
  return row?.value ?? 0;
}

export async function deleteMembershipForDeletion(db: BehalfPostgresDb, membershipId: string) {
  const rows = await db
    .delete(accountMemberships)
    .where(eq(accountMemberships.membershipId, membershipId))
    .returning({ membershipId: accountMemberships.membershipId });
  return { acknowledged: true, deletedCount: rows.length };
}

/**
 * Cascade-delete all Postgres rows for an account (and related user-scoped rows
 * that Mongo's deleteAccountCascade also clears), including policy_documents,
 * integration_bindings, and collaboration_message_refs.
 */
export async function deleteAccountCascade(
  db: BehalfPostgresDb,
  accountId: string,
  userId: string
) {
  await db.transaction(async (tx) => {
    const agentRows = await tx
      .select({ agentId: agents.agentId })
      .from(agents)
      .where(eq(agents.accountId, accountId));
    const agentIds = agentRows.map((row) => row.agentId);

    const siteRows = await tx
      .select({ siteId: sites.siteId })
      .from(sites)
      .where(eq(sites.accountId, accountId));
    const siteIds = siteRows.map((row) => row.siteId);

    const endpointRows = await tx
      .select({ webhookId: webhookEndpoints.webhookId })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.accountId, accountId));
    const webhookIds = endpointRows.map((row) => row.webhookId);

    const eventRows = await tx
      .select({ eventId: webhookEvents.eventId })
      .from(webhookEvents)
      .where(eq(webhookEvents.accountId, accountId));
    const eventIds = eventRows.map((row) => row.eventId);

    await tx
      .delete(verificationLogs)
      .where(
        or(
          eq(verificationLogs.accountId, accountId),
          eq(verificationLogs.developerUserId, userId),
          ...(agentIds.length ? [inArray(verificationLogs.agentId, agentIds)] : [])
        )
      );

    await tx
      .delete(approvalRequests)
      .where(
        or(
          eq(approvalRequests.accountId, accountId),
          eq(approvalRequests.developerUserId, userId),
          ...(agentIds.length ? [inArray(approvalRequests.agentId, agentIds)] : [])
        )
      );

    await tx
      .delete(permissions)
      .where(
        agentIds.length
          ? or(eq(permissions.accountId, accountId), inArray(permissions.agentId, agentIds))
          : eq(permissions.accountId, accountId)
      );

    await tx.delete(agents).where(eq(agents.accountId, accountId));
    await tx.delete(accountInvites).where(eq(accountInvites.accountId, accountId));
    await tx
      .delete(developerApiTokens)
      .where(
        or(eq(developerApiTokens.accountId, accountId), eq(developerApiTokens.userId, userId))
      );

    if (siteIds.length) {
      await tx.delete(siteAccessLogs).where(inArray(siteAccessLogs.siteId, siteIds));
      await tx.delete(siteAccessRules).where(inArray(siteAccessRules.siteId, siteIds));
      await tx.delete(siteGuardKeys).where(inArray(siteGuardKeys.siteId, siteIds));
    }
    await tx.delete(siteAccessLogs).where(eq(siteAccessLogs.accountId, accountId));
    await tx.delete(sites).where(eq(sites.accountId, accountId));

    await tx
      .delete(webhookDeliveries)
      .where(
        or(
          eq(webhookDeliveries.accountId, accountId),
          ...(webhookIds.length ? [inArray(webhookDeliveries.webhookId, webhookIds)] : []),
          ...(eventIds.length ? [inArray(webhookDeliveries.eventId, eventIds)] : [])
        )
      );
    await tx.delete(webhookEvents).where(eq(webhookEvents.accountId, accountId));
    await tx.delete(webhookEndpoints).where(eq(webhookEndpoints.accountId, accountId));

    await tx.delete(permissionProfiles).where(eq(permissionProfiles.accountId, accountId));
    await tx
      .delete(managedProfileProtectedRepos)
      .where(eq(managedProfileProtectedRepos.accountId, accountId));
    await tx
      .delete(managedProfilePolicies)
      .where(eq(managedProfilePolicies.accountId, accountId));

    await tx.delete(cliPauseLeases).where(eq(cliPauseLeases.accountId, accountId));
    await tx.delete(cliAuditActivities).where(eq(cliAuditActivities.accountId, accountId));

    await tx
      .delete(collaborationMessageRefs)
      .where(eq(collaborationMessageRefs.accountId, accountId));
    await tx.delete(integrationBindings).where(eq(integrationBindings.accountId, accountId));
    await tx.delete(policyDocuments).where(eq(policyDocuments.accountId, accountId));

    await tx.delete(accountMemberships).where(eq(accountMemberships.accountId, accountId));
    await tx.delete(accounts).where(eq(accounts.accountId, accountId));
  });
}

/**
 * Workspace-owned rows that still reference a user after their sole-owned
 * workspaces are cascaded (shared workspaces, or workspaces they were removed
 * from) would otherwise block the developer_users delete with a foreign-key
 * violation (23503), leaving the account undeletable.
 *
 * - Nullable creator references (agents, permissions, approval requests,
 *   webhook events) are cleared: the rows stay with the workspace.
 * - The user's own webhook endpoints (and their deliveries) are deleted, as
 *   removeMember does, so workspace events stop going to their URLs.
 * - Pending invites they sent are deleted.
 * - NOT NULL creator references (sites, Site Guard rules/keys, permission
 *   profiles) are reassigned to a remaining OWNER of the row's workspace. If a
 *   workspace has no other owner the update violates NOT NULL and the whole
 *   transaction rolls back rather than leaving a half-deleted user.
 */
async function detachWorkspaceReferences(tx: BehalfPostgresDb, userId: string) {
  const successorOwner = (accountIdColumn: unknown) => sql`(
    select m.user_id from account_memberships m
    where m.account_id = ${accountIdColumn} and m.role = 'OWNER' and m.user_id <> ${userId}
    order by m.created_at asc, m.user_id asc
    limit 1
  )`;

  for (const table of [agents, permissions, approvalRequests, webhookEvents]) {
    await tx
      .update(table)
      .set({ developerUserId: null } as never)
      .where(eq(table.developerUserId, userId));
  }

  const endpointRows = await tx
    .select({ webhookId: webhookEndpoints.webhookId })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.developerUserId, userId));
  const webhookIds = endpointRows.map((row) => row.webhookId);
  if (webhookIds.length) {
    await tx.delete(webhookDeliveries).where(inArray(webhookDeliveries.webhookId, webhookIds));
    await tx.delete(webhookEndpoints).where(inArray(webhookEndpoints.webhookId, webhookIds));
  }

  await tx.delete(accountInvites).where(eq(accountInvites.invitedBy, userId));

  for (const table of [sites, siteAccessRules, siteGuardKeys]) {
    await tx
      .update(table)
      .set({ developerUserId: successorOwner(table.accountId) } as never)
      .where(eq(table.developerUserId, userId));
  }
  await tx
    .update(permissionProfiles)
    .set({ createdBy: successorOwner(permissionProfiles.accountId) } as never)
    .where(eq(permissionProfiles.createdBy, userId));
}

export async function deleteDeveloperUserCredentials(db: BehalfPostgresDb, userId: string) {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as BehalfPostgresDb;
    await detachWorkspaceReferences(txDb, userId);
    await tx.delete(developerSessions).where(eq(developerSessions.userId, userId));
    await tx.delete(developerApiTokens).where(eq(developerApiTokens.userId, userId));
    await tx.delete(identityAuditLogs).where(eq(identityAuditLogs.userId, userId));
    const rows = await tx
      .delete(developerUsers)
      .where(eq(developerUsers.userId, userId))
      .returning({ userId: developerUsers.userId });
    return { acknowledged: true, deletedCount: rows.length };
  });
}
