import { NextResponse, type NextRequest } from "next/server";
import { clearConsoleSessionCookie, requireConsoleMutationOrigin } from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  const originError = requireConsoleMutationOrigin(request);
  if (originError) {
    return originError;
  }

  const response = NextResponse.json({ loggedOut: true });
  clearConsoleSessionCookie(response);
  return response;
}
