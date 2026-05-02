import { NextResponse } from "next/server";
import { clearConsoleSessionCookie } from "@/lib/adminAuth";

export async function POST() {
  const response = NextResponse.json({ loggedOut: true });
  clearConsoleSessionCookie(response);
  return response;
}
