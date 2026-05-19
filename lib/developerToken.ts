import crypto from "crypto";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import DeveloperApiToken, { type DeveloperApiTokenDocument } from "@/models/DeveloperApiToken";

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
  | { tokenDoc: DeveloperApiTokenDocument; error: null }
  | { tokenDoc: null; error: null }
  | { tokenDoc: null; error: string };

export async function authenticateDeveloperToken(request: NextRequest): Promise<AuthResult> {
  const token = getDeveloperTokenFromHeader(request);
  if (!token) return { tokenDoc: null, error: null };

  await connectToDatabase();
  const hash = hashDeveloperToken(token);
  const tokenDoc = await DeveloperApiToken.findOne({ tokenHash: hash }).select("+tokenHash");
  if (!tokenDoc) return { tokenDoc: null, error: "Invalid developer token." };

  Promise.resolve(
    DeveloperApiToken.updateOne({ tokenId: tokenDoc.tokenId }, { $set: { lastUsedAt: new Date() } })
  ).catch((error: unknown) => {
    logger.warn("Failed to update developer token lastUsedAt.", {
      tokenId: tokenDoc.tokenId,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  return { tokenDoc, error: null };
}
