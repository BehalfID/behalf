import type { NextRequest } from "next/server";
import { requireCliAuth } from "@/lib/cliAuth";
import {
  recordCliAuditEvent,
  resolveCliSessionPolicy,
  validateSessionPolicyInput,
  type CliSessionPolicyInput,
} from "@/lib/cliSessionPolicy";
import { readJsonObject } from "@/lib/request";
import { jsonError, noCacheJson } from "@/lib/responses";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readString, rejectUnknownFields } from "@/lib/validation";

const ALLOWED_FIELDS = [
  "tool",
  "cwd",
  "gitRemote",
  "branch",
  "repoRoot",
  "deviceId",
  "cliVersion",
  "workspaceId",
];

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ALLOWED_FIELDS);
  if (unknownError) return jsonError(unknownError);

  const input: CliSessionPolicyInput = {
    tool: readString(body.tool),
    cwd: readString(body.cwd) || null,
    gitRemote: readString(body.gitRemote) || null,
    branch: readString(body.branch) || null,
    repoRoot: readString(body.repoRoot) || null,
    deviceId: readString(body.deviceId) || null,
    cliVersion: readString(body.cliVersion) || null,
    workspaceId: readString(body.workspaceId) || null,
  };

  if (!input.tool) return jsonError("tool is required.");

  const validationError = validateSessionPolicyInput(input);
  if (validationError) return jsonError(validationError);

  const { auth } = await requireCliAuth(request);
  const policy = await resolveCliSessionPolicy(auth!, input);

  await recordCliAuditEvent({
    auth: auth!,
    eventType: "cli_session_policy",
    tool: input.tool,
    repo: input.repoRoot,
    branch: input.branch,
    mode: policy.mode,
    reason: policy.reason,
    metadata: {
      sessionId: policy.sessionId,
      profileId: policy.profileId,
      profileName: policy.profileName,
      deviceId: input.deviceId,
      expiresAt: policy.expiresAt,
    },
  });

  return noCacheJson(policy);
}
