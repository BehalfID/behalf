import crypto from "crypto";
import type { NextRequest } from "next/server";
import { clientIpFromRequest, hashIp } from "@/lib/authEvents";
import { getPostgresDb } from "@/lib/db/postgres";
import { logger } from "@/lib/logger";
import * as identityAudit from "@/lib/repositories/postgres/identityAudit";
import type {
  IdentityAuditAction,
  IdentityAuditProvider
} from "@/lib/repositories/postgres/identityAudit";

export type { IdentityAuditAction, IdentityAuditProvider };

export type IdentityAuditInput = {
  userId: string;
  action: IdentityAuditAction;
  provider: IdentityAuditProvider;
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
    await identityAudit.createIdentityAuditLog(getPostgresDb(), {
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
  return identityAudit.listIdentityAuditLogs(getPostgresDb(), userId, limit);
}
