import { and, desc, eq } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import {
  collaborationMessageRefs,
  integrationBindings
} from "@/lib/db/postgres/schema";
import { createPublicId } from "@/lib/ids";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CollaborationMessageRefLean,
  CreateSlackBindingInput,
  IntegrationBindingLean
} from "@/lib/repositories/integrationBindings";

type BindingRow = typeof integrationBindings.$inferSelect;
type MessageRefRow = typeof collaborationMessageRefs.$inferSelect;

type IdentityMapEntry = { externalUserId: string; userId: string };

function identityMapOf(row: BindingRow): IdentityMapEntry[] {
  const raw = row.identityMap;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is IdentityMapEntry =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as IdentityMapEntry).externalUserId === "string" &&
      typeof (entry as IdentityMapEntry).userId === "string"
  );
}

function toBindingLean(row: BindingRow, includeSecrets = false): IntegrationBindingLean {
  const base = {
    bindingId: row.bindingId,
    accountId: row.accountId,
    provider: row.provider,
    status: row.status,
    teamId: row.teamId,
    teamName: row.teamName ?? undefined,
    channelId: row.channelId,
    channelName: row.channelName ?? undefined,
    identityMap: identityMapOf(row),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
  if (includeSecrets) {
    return {
      ...base,
      botToken: row.botToken,
      signingSecret: row.signingSecret
    } as IntegrationBindingLean;
  }
  return base as IntegrationBindingLean;
}

function toMessageRefLean(row: MessageRefRow): CollaborationMessageRefLean {
  return {
    refId: row.refId,
    accountId: row.accountId,
    provider: row.provider,
    bindingId: row.bindingId,
    approvalId: row.approvalId,
    channelId: row.channelId,
    messageTs: row.messageTs,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  } as CollaborationMessageRefLean;
}

export async function listIntegrationBindings(
  db: BehalfPostgresDb,
  accountId: string,
  provider?: "slack"
) {
  const rows = await db.query.integrationBindings.findMany({
    where: and(
      eq(integrationBindings.accountId, accountId),
      eq(integrationBindings.status, "active"),
      ...(provider ? [eq(integrationBindings.provider, provider)] : [])
    ),
    orderBy: desc(integrationBindings.createdAt)
  });
  return rows.map((row) => toBindingLean(row, false));
}

export async function findIntegrationBinding(
  db: BehalfPostgresDb,
  bindingId: string,
  accountId: string
): Promise<IntegrationBindingLean | null> {
  const row =
    (await db.query.integrationBindings.findFirst({
      where: and(
        eq(integrationBindings.bindingId, bindingId),
        eq(integrationBindings.accountId, accountId)
      )
    })) ?? null;
  return row ? toBindingLean(row, false) : null;
}

export async function findSlackBindingsWithSecrets(db: BehalfPostgresDb, accountId: string) {
  const rows = await db.query.integrationBindings.findMany({
    where: and(
      eq(integrationBindings.accountId, accountId),
      eq(integrationBindings.provider, "slack"),
      eq(integrationBindings.status, "active")
    )
  });
  return rows.map((row) => toBindingLean(row, true));
}

export async function findSlackBindingByTeamWithSecrets(db: BehalfPostgresDb, teamId: string) {
  const rows = await db.query.integrationBindings.findMany({
    where: and(
      eq(integrationBindings.provider, "slack"),
      eq(integrationBindings.status, "active"),
      eq(integrationBindings.teamId, teamId)
    )
  });
  return rows.map((row) => toBindingLean(row, true));
}

export async function createSlackBinding(db: BehalfPostgresDb, input: CreateSlackBindingInput) {
  try {
    const [row] = await db
      .insert(integrationBindings)
      .values({
        bindingId: createPublicId("ibind"),
        accountId: input.accountId,
        provider: "slack",
        status: "active",
        teamId: input.teamId,
        teamName: input.teamName,
        channelId: input.channelId,
        channelName: input.channelName,
        botToken: input.botToken,
        signingSecret: input.signingSecret,
        identityMap: input.identityMap ?? [],
        createdBy: input.createdBy
      })
      .returning();
    if (!row) throw new Error("createSlackBinding failed to return a row");
    return toBindingLean(row, true);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function upsertIdentityMapping(
  db: BehalfPostgresDb,
  bindingId: string,
  accountId: string,
  externalUserId: string,
  userId: string
) {
  const existing =
    (await db.query.integrationBindings.findFirst({
      where: and(
        eq(integrationBindings.bindingId, bindingId),
        eq(integrationBindings.accountId, accountId)
      )
    })) ?? null;
  if (!existing) return null;

  const map = identityMapOf(existing).filter((entry) => entry.externalUserId !== externalUserId);
  map.push({ externalUserId, userId });

  const [row] = await db
    .update(integrationBindings)
    .set({ identityMap: map, updatedAt: new Date() })
    .where(
      and(
        eq(integrationBindings.bindingId, bindingId),
        eq(integrationBindings.accountId, accountId)
      )
    )
    .returning();
  return row ? toBindingLean(row, true) : null;
}

export async function disableIntegrationBinding(
  db: BehalfPostgresDb,
  bindingId: string,
  accountId: string
) {
  const [row] = await db
    .update(integrationBindings)
    .set({ status: "disabled", updatedAt: new Date() })
    .where(
      and(
        eq(integrationBindings.bindingId, bindingId),
        eq(integrationBindings.accountId, accountId)
      )
    )
    .returning();
  return row ? toBindingLean(row, false) : null;
}

export async function findMessageRefByApproval(
  db: BehalfPostgresDb,
  accountId: string,
  approvalId: string,
  provider: "slack" = "slack"
) {
  const row =
    (await db.query.collaborationMessageRefs.findFirst({
      where: and(
        eq(collaborationMessageRefs.accountId, accountId),
        eq(collaborationMessageRefs.approvalId, approvalId),
        eq(collaborationMessageRefs.provider, provider)
      )
    })) ?? null;
  return row ? toMessageRefLean(row) : null;
}

export async function upsertMessageRef(
  db: BehalfPostgresDb,
  input: {
    accountId: string;
    bindingId: string;
    approvalId: string;
    channelId: string;
    messageTs: string;
    status: "pending" | "approved" | "denied" | "used";
    provider?: "slack";
  }
) {
  try {
    const provider = input.provider ?? "slack";
    const [row] = await db
      .insert(collaborationMessageRefs)
      .values({
        refId: createPublicId("omsg"),
        accountId: input.accountId,
        approvalId: input.approvalId,
        provider,
        bindingId: input.bindingId,
        channelId: input.channelId,
        messageTs: input.messageTs,
        status: input.status
      })
      .onConflictDoUpdate({
        target: [
          collaborationMessageRefs.accountId,
          collaborationMessageRefs.approvalId,
          collaborationMessageRefs.provider
        ],
        set: {
          bindingId: input.bindingId,
          channelId: input.channelId,
          messageTs: input.messageTs,
          status: input.status,
          updatedAt: new Date()
        }
      })
      .returning();
    if (!row) throw new Error("upsertMessageRef failed to return a row");
    return toMessageRefLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export function resolveUserIdFromBinding(
  binding: Pick<IntegrationBindingLean, "identityMap">,
  externalUserId: string
): string | null {
  const entry = (binding.identityMap ?? []).find(
    (item) => item.externalUserId === externalUserId
  );
  return entry?.userId ?? null;
}
