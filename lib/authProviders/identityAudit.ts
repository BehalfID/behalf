import crypto from "crypto";
import type { NextRequest } from "next/server";
import { clientIpFromRequest, hashIp } from "@/lib/authEvents";
import { logger } from "@/lib/logger";
import type { ExternalIdentityProvider } from "@/models/ExternalIdentity";
import IdentityAuditLog, { type IdentityAuditAction } from "@/models/IdentityAuditLog";

export type IdentityAuditInput = {
  userId: string;
  action: IdentityAuditAction;
  provider: ExternalIdentityProvider;
  providerAccountId: string;
  providerUsername?: string | null;
  request?: NextRequest;
  /** Non-secret origin of the change, e.g. "settings" or "oauth_callback". */
  context?: string;
};

/**
 * Records an identity lifecycle event.
 *
 * Best-effort by design: an audit write failure must not block a sign-in or
 * strand a half-completed link. Failures are logged so the gap is visible
 * rather than silent.
 */
export async function recordIdentityAudit(input: IdentityAuditInput): Promise<void> {
  try {
    await IdentityAuditLog.create({
      entryId: `idaud_${crypto.randomBytes(12).toString("hex")}`,
      userId: input.userId,
      action: input.action,
      provider: input.provider,
      providerAccountId: input.providerAccountId.slice(0, 120),
      providerUsername: input.providerUsername ?? null,
      ipHash: input.request ? hashIp(clientIpFromRequest(input.request)) : null,
      context: input.context ?? null
    });
  } catch (error) {
    logger.warn("identity_audit_record_failed", {
      action: input.action,
      provider: input.provider,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function listIdentityAudit(userId: string, limit = 25) {
  return IdentityAuditLog.find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .select("-_id entryId action provider providerUsername context createdAt")
    .lean();
}
