import crypto from "crypto";
import { connectToDatabase } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/developerAuth";
import { logger } from "@/lib/logger";
import AdminAuditLog from "@/models/AdminAuditLog";
import ConsoleAdmin from "@/models/ConsoleAdmin";

export function allowSharedConsoleAdmin(): boolean {
  if (process.env.BEHALFID_ALLOW_SHARED_ADMIN === "true") return true;
  if (process.env.BEHALFID_ALLOW_SHARED_ADMIN === "false") return false;
  // Default: allow shared password outside production so local/dev keeps working;
  // production requires explicit opt-in once ConsoleAdmins exist, or when none exist yet.
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV !== "production";
}

export async function countConsoleAdmins(): Promise<number> {
  await connectToDatabase();
  return ConsoleAdmin.countDocuments({ disabledAt: null });
}

export async function createConsoleAdmin(input: {
  email: string;
  password: string;
  role?: "owner" | "operator";
}) {
  await connectToDatabase();
  const adminId = `cad_${crypto.randomBytes(10).toString("hex")}`;
  await ConsoleAdmin.create({
    adminId,
    email: input.email.trim().toLowerCase(),
    passwordHash: await hashPassword(input.password),
    role: input.role ?? "owner"
  });
  return adminId;
}

export async function authenticateConsoleAdmin(email: string, password: string) {
  await connectToDatabase();
  const admin = await ConsoleAdmin.findOne({
    email: email.trim().toLowerCase(),
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
    await connectToDatabase();
    await AdminAuditLog.create({
      entryId: `aal_${crypto.randomBytes(10).toString("hex")}`,
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
