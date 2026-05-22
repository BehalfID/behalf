import crypto from "crypto";
import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { logger } from "@/lib/logger";
import SiteGuardKey, { type SiteGuardKeyDocument } from "@/models/SiteGuardKey";

export function getSiteGuardKeyFromHeader(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") {
    return null;
  }
  const token = parts[1];
  return token?.startsWith("bhf_site_") ? token : null;
}

export function hashSiteGuardKey(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function previewSiteGuardKey(token: string) {
  return `${token.slice(0, 16)}...${token.slice(-6)}`;
}

type KeyAuthResult =
  | { keyDoc: SiteGuardKeyDocument; error: null }
  | { keyDoc: null; error: null }
  | { keyDoc: null; error: string };

export async function authenticateSiteGuardKey(request: NextRequest): Promise<KeyAuthResult> {
  const token = getSiteGuardKeyFromHeader(request);
  if (!token) return { keyDoc: null, error: null };

  await connectToDatabase();
  const hash = hashSiteGuardKey(token);
  const keyDoc = await SiteGuardKey.findOne({ keyHash: hash }).select("+keyHash");
  if (!keyDoc) return { keyDoc: null, error: "Invalid Site Guard key." };
  if (keyDoc.status !== "active") return { keyDoc: null, error: "Site Guard key has been revoked." };

  return { keyDoc, error: null };
}

export function updateSiteGuardKeyLastUsed(keyId: string) {
  Promise.resolve(
    SiteGuardKey.updateOne({ keyId }, { $set: { lastUsedAt: new Date() } })
  ).catch((error: unknown) => {
    logger.warn("Failed to update site guard key lastUsedAt.", {
      keyId,
      error: error instanceof Error ? error.message : String(error)
    });
  });
}
