import type { NextRequest } from "next/server";
import { requireDeveloperSessionForPause } from "@/lib/cliAuth";
import { requestCliPauseLease } from "@/lib/cliSessionPolicy";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readString, rejectUnknownFields } from "@/lib/validation";

const ALLOWED_FIELDS = [
  "durationMinutes",
  "reason",
  "scope",
  "tool",
  "repo",
  "branch",
  "deviceId",
];

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const authResult = await requireDeveloperSessionForPause(request);
  if (authResult.error || !authResult.auth) return authResult.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ALLOWED_FIELDS);
  if (unknownError) return jsonError(unknownError);

  const durationRaw = body.durationMinutes;
  const durationMinutes =
    typeof durationRaw === "number"
      ? durationRaw
      : typeof durationRaw === "string"
        ? Number(durationRaw)
        : NaN;

  const input = {
    durationMinutes,
    reason: readString(body.reason),
    scope: readString(body.scope) as "current_repo" | "all" | "",
    tool: readString(body.tool) || null,
    repo: readString(body.repo) || null,
    branch: readString(body.branch) || null,
    deviceId: readString(body.deviceId) || null,
  };

  const result = await requestCliPauseLease(authResult.auth, {
    ...input,
    scope: input.scope === "all" ? "all" : "current_repo",
  });

  if (!result.granted) {
    if (result.approvalRequired) {
      return noCacheJson(result, { status: 202 });
    }
    if (result.mode === "required") {
      return jsonError(result.reason, 403);
    }
    return jsonError(result.reason, 400);
  }

  return noCacheJson(result);
}
