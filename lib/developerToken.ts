import crypto from "crypto";
import type { NextRequest } from "next/server";
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
  | { tokenDoc: DeveloperApiTokenLean; error: null }
  | { tokenDoc: null; error: null }
  | { tokenDoc: null; error: string };

export async function authenticateDeveloperToken(request: NextRequest): Promise<AuthResult> {
  const token = getDeveloperTokenFromHeader(request);
  if (!token) return { tokenDoc: null, error: null };

  const hash = hashDeveloperToken(token);
  const tokenDoc = await findByTokenHash(hash);
  if (!tokenDoc) return { tokenDoc: null, error: "Invalid developer token." };

  Promise.resolve(touchLastUsed(tokenDoc.tokenId)).catch((error: unknown) => {
    logger.warn("Failed to update developer token lastUsedAt.", {
      tokenId: tokenDoc.tokenId,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  return { tokenDoc, error: null };
}
