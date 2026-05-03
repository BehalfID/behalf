import { NextResponse, type NextRequest } from "next/server";
import { requireDeveloperApi } from "@/lib/developerAuth";

export async function GET(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth.error;
  return NextResponse.json({
    email: auth.user.email,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
    apiUsage: "Usage reporting is coming soon.",
    dangerZone: "Account deletion is not available in this prototype."
  });
}
