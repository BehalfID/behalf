import { and, desc, eq } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { permissionProfiles } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreatePermissionProfileInput,
  ProfilePermissionEntry
} from "@/lib/repositories/permissionProfiles";

type ProfileRow = typeof permissionProfiles.$inferSelect;

export type PermissionProfileDomain = {
  profileId: string;
  accountId: string;
  name: string;
  description: string | null;
  permissions: ProfilePermissionEntry[];
  requiredAuthorityLevel: number;
  createdBy: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function normalizePermissions(value: unknown): ProfilePermissionEntry[] {
  if (!Array.isArray(value)) return [];
  return value as ProfilePermissionEntry[];
}

function normalizeProfile(row: ProfileRow): PermissionProfileDomain {
  return {
    profileId: row.profileId,
    accountId: row.accountId,
    name: row.name,
    description: row.description,
    permissions: normalizePermissions(row.permissions),
    requiredAuthorityLevel: row.requiredAuthorityLevel,
    createdBy: row.createdBy,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function listPermissionProfiles(
  db: BehalfPostgresDb,
  accountId: string
): Promise<PermissionProfileDomain[]> {
  const rows = await db.query.permissionProfiles.findMany({
    where: and(
      eq(permissionProfiles.accountId, accountId),
      eq(permissionProfiles.status, "active")
    ),
    orderBy: desc(permissionProfiles.createdAt)
  });
  return rows.map(normalizeProfile);
}

export async function findPermissionProfile(
  db: BehalfPostgresDb,
  profileId: string,
  accountId: string
): Promise<PermissionProfileDomain | null> {
  const row =
    (await db.query.permissionProfiles.findFirst({
      where: and(
        eq(permissionProfiles.profileId, profileId),
        eq(permissionProfiles.accountId, accountId)
      )
    })) ?? null;
  return row ? normalizeProfile(row) : null;
}

export async function createPermissionProfile(
  db: BehalfPostgresDb,
  input: CreatePermissionProfileInput
) {
  try {
    const [row] = await db
      .insert(permissionProfiles)
      .values({
        profileId: input.profileId,
        accountId: input.accountId,
        name: input.name,
        description: input.description,
        permissions: input.permissions,
        requiredAuthorityLevel: input.requiredAuthorityLevel,
        createdBy: input.createdBy,
        status: input.status
      })
      .returning();
    if (!row) throw new Error("createPermissionProfile failed to return a row");
    return normalizeProfile(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function updatePermissionProfile(
  db: BehalfPostgresDb,
  profileId: string,
  accountId: string,
  update: Partial<
    Pick<
      CreatePermissionProfileInput,
      "name" | "description" | "permissions" | "requiredAuthorityLevel" | "status"
    >
  >
) {
  const [row] = await db
    .update(permissionProfiles)
    .set({ ...update, updatedAt: new Date() })
    .where(
      and(
        eq(permissionProfiles.profileId, profileId),
        eq(permissionProfiles.accountId, accountId)
      )
    )
    .returning();
  return row ? normalizeProfile(row) : null;
}
