import crypto from "crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import { getPostgresDb } from "@/lib/db/postgres";
import { adminAuditLogs, consoleAdmins } from "@/lib/db/postgres/schema";
import { hashPassword, verifyPassword } from "@/lib/developerAuth";
import { logger } from "@/lib/logger";
import { isPostgresRuntimeEnabled } from "@/lib/repositories/backend";

export function allowSharedConsoleAdmin(): boolean {
  if (process.env.BEHALFID_ALLOW_SHARED_ADMIN === "true") return true;
  if (process.env.BEHALFID_ALLOW_SHARED_ADMIN === "false") return false;
  // Default: allow shared password outside production so local/dev keeps working;
  // production requires explicit opt-in once ConsoleAdmins exist, or when none exist yet.
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV !== "production";
}

export async function countConsoleAdmins(): Promise<number> {
  if (isPostgresRuntimeEnabled()) {
    const db = getPostgresDb();
    const [row] = await db
      .select({ value: count() })
      .from(consoleAdmins)
      .where(isNull(consoleAdmins.disabledAt));
    return row?.value ?? 0;
  }

  const { connectToDatabase } = await import("@/lib/db");
  const ConsoleAdmin = (await import("@/models/ConsoleAdmin")).default;
  await connectToDatabase();
  return ConsoleAdmin.countDocuments({ disabledAt: null });
}

export async function createConsoleAdmin(input: {
  email: string;
  password: string;
  role?: "owner" | "operator";
}) {
  const adminId = `cad_${crypto.randomBytes(10).toString("hex")}`;
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const role = input.role ?? "owner";

  if (isPostgresRuntimeEnabled()) {
    const db = getPostgresDb();
    await db.insert(consoleAdmins).values({
      adminId,
      email,
      passwordHash,
      role
    });
    return adminId;
  }

  const { connectToDatabase } = await import("@/lib/db");
  const ConsoleAdmin = (await import("@/models/ConsoleAdmin")).default;
  await connectToDatabase();
  await ConsoleAdmin.create({
    adminId,
    email,
    passwordHash,
    role
  });
  return adminId;
}

export async function authenticateConsoleAdmin(email: string, password: string) {
  const normalized = email.trim().toLowerCase();

  if (isPostgresRuntimeEnabled()) {
    const db = getPostgresDb();
    const [admin] = await db
      .select()
      .from(consoleAdmins)
      .where(and(eq(consoleAdmins.email, normalized), isNull(consoleAdmins.disabledAt)))
      .limit(1);
    if (!admin?.passwordHash) return null;
    if (!(await verifyPassword(password, admin.passwordHash))) return null;
    await db
      .update(consoleAdmins)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(consoleAdmins.adminId, admin.adminId));
    return { adminId: admin.adminId, email: admin.email, role: admin.role as string };
  }

  const { connectToDatabase } = await import("@/lib/db");
  const ConsoleAdmin = (await import("@/models/ConsoleAdmin")).default;
  await connectToDatabase();
  const admin = await ConsoleAdmin.findOne({
    email: normalized,
    disabledAt: null
  }).select("+passwordHash");
  if (!admin?.passwordHash) return null;
  if (!(await verifyPassword(password, admin.passwordHash))) return null;
  await ConsoleAdmin.updateOne({ adminId: admin.adminId }, { $set: { lastLoginAt: new Date() } });
  return { adminId: admin.adminId, email: admin.email, role: admin.role as string };
}

export async function recordAdminAudit(input: {
  adminId: string;
  action: string;
  target?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const entryId = `aal_${crypto.randomBytes(10).toString("hex")}`;
    if (isPostgresRuntimeEnabled()) {
      const db = getPostgresDb();
      await db.insert(adminAuditLogs).values({
        entryId,
        adminId: input.adminId,
        action: input.action,
        target: input.target,
        requestId: input.requestId,
        metadata: input.metadata
      });
      return;
    }

    const { connectToDatabase } = await import("@/lib/db");
    const AdminAuditLog = (await import("@/models/AdminAuditLog")).default;
    await connectToDatabase();
    await AdminAuditLog.create({
      entryId,
      adminId: input.adminId,
      action: input.action,
      target: input.target,
      requestId: input.requestId,
      metadata: input.metadata
    });
  } catch (error) {
    logger.warn("admin_audit_record_failed", {
      action: input.action,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
