import { and, eq, lte } from "drizzle-orm";
import type { BehalfPostgresDb } from "@/lib/db/postgres";
import { deviceCodes } from "@/lib/db/postgres/schema";
import { translatePostgresError } from "@/lib/repositories/errors";
import type {
  CreateDeviceCodeInput,
  DeviceCodeLean,
  DeviceCodeStatus
} from "@/lib/repositories/deviceCodes";

type DeviceCodeRow = typeof deviceCodes.$inferSelect;

function toLean(row: DeviceCodeRow): DeviceCodeLean {
  return {
    codeId: row.codeId,
    deviceCode: row.deviceCode,
    userCode: row.userCode,
    status: row.status as DeviceCodeStatus,
    userId: row.userId,
    sessionToken: row.sessionToken,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt
  };
}

export async function createDeviceCode(
  db: BehalfPostgresDb,
  input: CreateDeviceCodeInput
): Promise<DeviceCodeLean> {
  try {
    const [row] = await db
      .insert(deviceCodes)
      .values({
        codeId: input.codeId,
        deviceCode: input.deviceCode,
        userCode: input.userCode,
        status: input.status ?? "pending",
        userId: input.userId ?? null,
        sessionToken: input.sessionToken ?? null,
        expiresAt: input.expiresAt
      })
      .returning();
    if (!row) throw new Error("createDeviceCode failed to return a row");
    return toLean(row);
  } catch (error) {
    translatePostgresError(error);
  }
}

export async function findByDeviceCode(
  db: BehalfPostgresDb,
  deviceCode: string
): Promise<DeviceCodeLean | null> {
  const row =
    (await db.query.deviceCodes.findFirst({
      where: eq(deviceCodes.deviceCode, deviceCode)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findByUserCode(
  db: BehalfPostgresDb,
  userCode: string,
  status?: DeviceCodeStatus
): Promise<DeviceCodeLean | null> {
  const row =
    (await db.query.deviceCodes.findFirst({
      where: status
        ? and(eq(deviceCodes.userCode, userCode), eq(deviceCodes.status, status))
        : eq(deviceCodes.userCode, userCode)
    })) ?? null;
  return row ? toLean(row) : null;
}

export async function findOneAndDeleteAuthorized(
  db: BehalfPostgresDb,
  deviceCode: string
): Promise<DeviceCodeLean | null> {
  const rows = await db
    .delete(deviceCodes)
    .where(and(eq(deviceCodes.deviceCode, deviceCode), eq(deviceCodes.status, "authorized")))
    .returning();
  const row = rows[0];
  return row ? toLean(row) : null;
}

export async function updateStatus(
  db: BehalfPostgresDb,
  userCode: string,
  status: DeviceCodeStatus,
  options?: { userId?: string | null; sessionToken?: string | null; expectedStatus?: DeviceCodeStatus }
) {
  const set: Partial<typeof deviceCodes.$inferInsert> = { status };
  if (options && "userId" in options) set.userId = options.userId ?? null;
  if (options && "sessionToken" in options) set.sessionToken = options.sessionToken ?? null;

  const rows = await db
    .update(deviceCodes)
    .set(set)
    .where(
      options?.expectedStatus
        ? and(eq(deviceCodes.userCode, userCode), eq(deviceCodes.status, options.expectedStatus))
        : eq(deviceCodes.userCode, userCode)
    )
    .returning({ codeId: deviceCodes.codeId });
  return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
}

export async function deleteExpired(db: BehalfPostgresDb, before = new Date()) {
  const rows = await db
    .delete(deviceCodes)
    .where(lte(deviceCodes.expiresAt, before))
    .returning({ codeId: deviceCodes.codeId });
  return { acknowledged: true, deletedCount: rows.length };
}
