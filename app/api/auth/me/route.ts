import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireDeveloperApi } from "@/lib/developerAuth";
import { jsonError, noCacheJson } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";
import { readJsonObject } from "@/lib/request";
import DeveloperUser from "@/models/DeveloperUser";

const VALID_USE_CASES = ["personal", "website", "sdk"] as const;

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  return noCacheJson({ user: auth.user });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, ["onboardingUseCase"]);
  if (unknownError) return jsonError(unknownError);

  const onboardingUseCase = readString(body.onboardingUseCase);
  if (!(VALID_USE_CASES as readonly string[]).includes(onboardingUseCase)) {
    return jsonError("onboardingUseCase must be one of: personal, website, sdk.");
  }

  await connectToDatabase();
  await DeveloperUser.updateOne({ userId: auth.user.userId }, { onboardingUseCase });
  return NextResponse.json({ ok: true });
}
