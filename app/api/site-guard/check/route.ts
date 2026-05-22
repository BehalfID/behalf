import { NextResponse, type NextRequest } from "next/server";
import { authenticateDeveloperToken } from "@/lib/developerToken";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { checkSiteAccess, cleanSiteGuardInput, normalizeSiteDomain, normalizeSitePath } from "@/lib/siteGuard";
import { isRecord, readString, rejectUnknownFields } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) return rateLimitError();

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "siteId",
    "domain",
    "path",
    "userAgent",
    "agentIdentifier",
    "metadata"
  ]);
  if (unknownError) return jsonError(unknownError);

  const siteId = readString(body.siteId);
  const domain = readString(body.domain);
  const path = readString(body.path);
  const userAgent = readString(body.userAgent);
  const agentIdentifier = readString(body.agentIdentifier);

  if (!siteId && !domain) return jsonError("siteId or domain is required.");
  if (domain && !normalizeSiteDomain(domain)) return jsonError("domain must be a hostname.");
  if (!normalizeSitePath(path)) return jsonError("path must be an absolute path without a query or fragment.");
  if (!userAgent) return jsonError("userAgent is required.");
  if (userAgent.length > 500) return jsonError("userAgent must be 500 characters or fewer.");
  if (body.metadata !== undefined && (!isRecord(body.metadata) || JSON.stringify(body.metadata).length > 2048)) {
    return jsonError("metadata must be an object under 2KB.");
  }

  const { tokenDoc, error: tokenError } = await authenticateDeveloperToken(request);
  if (tokenError || !tokenDoc) {
    return jsonError(tokenError ?? "Developer token required.", 401);
  }

  const decision = await checkSiteAccess(
    cleanSiteGuardInput({
      accountId: tokenDoc.accountId,
      developerUserId: tokenDoc.userId,
      siteId: siteId || undefined,
      domain: domain || undefined,
      path,
      userAgent,
      agentIdentifier: agentIdentifier || undefined,
      metadata: body.metadata
    })
  );

  return NextResponse.json({
    allowed: decision.allowed,
    reason: decision.reason,
    requestId: decision.requestId,
    matchedRuleId: decision.matchedRuleId,
    siteId: decision.siteId
  });
}
