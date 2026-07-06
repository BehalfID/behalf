import type { NextRequest } from "next/server";
import { requireCliAuth } from "@/lib/cliAuth";
import {
  resolveManagedProfilePolicyDecision,
  validateSessionPolicySimulateInput,
} from "@/lib/cliSessionPolicy";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readString, rejectUnknownFields } from "@/lib/validation";

const ALLOWED_FIELDS = ["tool", "repo", "branch", "deviceId", "workspaceId", "accountId"];

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ALLOWED_FIELDS);
  if (unknownError) return jsonError(unknownError);

  const input = {
    tool: readString(body.tool),
    repo: readString(body.repo) || null,
    branch: readString(body.branch) || null,
    deviceId: readString(body.deviceId) || null,
  };

  if (!input.tool) return jsonError("tool is required.");

  const validationError = validateSessionPolicySimulateInput(input);
  if (validationError) return jsonError(validationError);

  const authResult = await requireCliAuth(request);
  if (authResult.error || !authResult.auth) return authResult.error;
  const auth = authResult.auth;

  const requestedAccountId =
    readString(body.workspaceId) || readString(body.accountId) || null;
  if (requestedAccountId) {
    if (!auth.accountId) {
      return jsonError("Account scope requires an authenticated workspace.", 403);
    }
    if (requestedAccountId !== auth.accountId) {
      return jsonError("Account scope does not match the authenticated workspace.", 403);
    }
  }

  const decision = await resolveManagedProfilePolicyDecision(auth, input);

  return noCacheJson({
    ok: true,
    mode: decision.mode,
    reason: decision.reason,
    profileId: decision.profileId,
    profileName: decision.profileName,
    matchedRule: decision.matchedRule,
    pausePolicy: decision.pausePolicy,
  });
}
