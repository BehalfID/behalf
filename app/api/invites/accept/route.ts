import { NextResponse, type NextRequest } from "next/server";
import {
  getCurrentDeveloperContext,
  isEmailVerified,
  requireDashboardMutationOrigin
} from "@/lib/developerAuth";
import { acceptInvite } from "@/lib/inviteAcceptance";
import { quotaErrorDetails } from "@/lib/quota";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) return rateLimitError();

  const originError = requireDashboardMutationOrigin(request);
  if (originError) return originError;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");
  const unknownError = rejectUnknownFields(body, ["token"]);
  if (unknownError) return jsonError(unknownError);

  const token = readString(body.token);
  if (!token) return jsonError("token is required.");

  const context = await getCurrentDeveloperContext();
  if (!context) {
    return jsonError("Sign in with the invited email to accept this workspace invite.", 401);
  }

  if (!isEmailVerified(context.user.emailVerified)) {
    return jsonError(
      "Email verification required. Check your inbox or resend the verification email before accepting this invite.",
      403
    );
  }

  const result = await acceptInvite(token, context.user.userId, context.user.email, {
    sessionId: context.session.sessionId
  });

  if ("error" in result) {
    if (result.error === "email_mismatch") {
      return jsonError(
        `This invite was sent to ${result.invitedEmail}. Sign in with that email to accept.`,
        403
      );
    }
    if (result.error === "expired") {
      return jsonError("This invite has expired. Ask the workspace owner to send a new invite.", 410);
    }
    if (result.error === "revoked") {
      return jsonError("This invite is no longer valid.", 410);
    }
    if (result.error === "seat_limit_reached") {
      return jsonError(
        result.quota.reason ?? "This workspace has reached its billable seat limit.",
        402,
        quotaErrorDetails(result.quota)
      );
    }
    return jsonError("This invite link is invalid.", 404);
  }

  return NextResponse.json(result);
}
