import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { authorizeEgressRequest } from "@/lib/egressAuthorize";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit(request);
  if (ipLimit.limited) return rateLimitError();

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "agentId",
    "method",
    "url",
    "host",
    "port",
    "protocol",
    "contentType",
    "bodySha256",
    "bytes"
  ]);
  if (unknownError) return jsonError(unknownError);

  const agentId = readString(body.agentId);
  const method = readString(body.method) || "GET";
  const host = readString(body.host);
  const url = readString(body.url);
  const port = typeof body.port === "number" ? body.port : Number(body.port);

  if (!agentId) return jsonError("agentId is required.");
  if (!host) return jsonError("host is required.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return jsonError("port must be an integer between 1 and 65535.");
  }

  try {
    await connectToDatabase();
  } catch {
    return jsonError("Service temporarily unavailable.", 503);
  }

  const auth = await authenticateAgent(request, agentId);
  if (auth.error || !auth.agent) {
    return jsonError(auth.error, auth.error === "Unknown agent." ? 404 : 401);
  }

  const limit = await checkRateLimit(request, auth.agent.apiKeyHash);
  if (limit.limited) return rateLimitError();

  const protocol =
    body.protocol === "http" || body.protocol === "https" || body.protocol === "connect"
      ? body.protocol
      : undefined;

  const decision = await authorizeEgressRequest({
    request: {
      agentId,
      method,
      url: url || `https://${host}:${port}/`,
      host,
      port,
      protocol,
      contentType: body.contentType === undefined ? undefined : readString(body.contentType),
      bodySha256: body.bodySha256 === undefined ? undefined : readString(body.bodySha256),
      bytes: typeof body.bytes === "number" ? body.bytes : undefined
    },
    accountId: auth.agent.accountId ?? undefined,
    developerUserId: auth.agent.developerUserId ?? undefined,
    agentStatus: auth.agent.status
  });

  return NextResponse.json(decision);
}
