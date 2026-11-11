import crypto from "crypto";
import type { NextRequest } from "next/server";
import { recordAuthFailure } from "@/lib/authEvents";
import type { WorkspaceActor } from "@/lib/delegatedAuth";
import { logger } from "@/lib/logger";
import {
  findByTokenHash,
  touchLastUsed,
  type DeveloperApiTokenLean
} from "@/lib/repositories/apiTokens";

export function getDeveloperTokenFromHeader(request: NextRequest) {
  const value = request.headers.get("x-developer-token")?.trim() ?? "";
  return value.startsWith("bhf_dev_") ? value : null;
}

export function hashDeveloperToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function previewDeveloperToken(token: string) {
  return `${token.slice(0, 12)}...${token.slice(-6)}`;
}

type AuthResult =
  | { tokenDoc: DeveloperApiTokenLean; actor: WorkspaceActor; error: null }
  | { tokenDoc: null; error: null }
  | { tokenDoc: null; error: string };

export async function authenticateDeveloperToken(request: NextRequest): Promise<AuthResult> {
  const token = getDeveloperTokenFromHeader(request);
  if (!token) return { tokenDoc: null, error: null };

  const hash = hashDeveloperToken(token);
  const tokenDoc = await findByTokenHash(hash);
  if (!tokenDoc) {
    await recordAuthFailure({
      request,
      surface: "developer_token",
      reason: "invalid_api_key",
      identityHint: `dev_token:${hash.slice(0, 10)}`
    });
    return { tokenDoc: null, error: "Invalid developer token." };
  }

  // A token acts for its creator inside one workspace. Re-check membership on
  // every use so removing a member (or the member leaving) also cuts off the
  // tokens they minted, instead of leaving them usable until manually revoked.
  const { getWorkspaceActor } = await import("@/lib/delegatedAuth");
  const actor = await getWorkspaceActor(tokenDoc.userId, tokenDoc.accountId);
  if (!actor) {
    await recordAuthFailure({
      request,
      surface: "developer_token",
      reason: "invalid_api_key",
      identityHint: `dev_token:${hash.slice(0, 10)}`
    });
    return { tokenDoc: null, error: "Invalid developer token." };
  }

  Promise.resolve(touchLastUsed(tokenDoc.tokenId)).catch((error: unknown) => {
    logger.warn("Failed to update developer token lastUsedAt.", {
      tokenId: tokenDoc.tokenId,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  return { tokenDoc, actor, error: null };
}
