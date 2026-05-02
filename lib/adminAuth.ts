import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";

const COOKIE_NAME = "behalfid_console";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getAdminPassword() {
  return process.env.BEHALFID_ADMIN_PASSWORD?.trim() ?? "";
}

function timingSafeEqualString(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function signSession(issuedAt: number, password: string) {
  return crypto.createHmac("sha256", password).update(String(issuedAt)).digest("base64url");
}

export function verifyAdminPassword(candidate: string) {
  const password = getAdminPassword();
  if (!password || !candidate) {
    return false;
  }

  return timingSafeEqualString(
    crypto.createHash("sha256").update(candidate).digest("hex"),
    crypto.createHash("sha256").update(password).digest("hex")
  );
}

export function createConsoleSessionValue() {
  const password = getAdminPassword();
  if (!password) {
    return null;
  }

  const issuedAt = Date.now();
  return `${issuedAt}.${signSession(issuedAt, password)}`;
}

export function isValidConsoleSession(value?: string) {
  const password = getAdminPassword();
  if (!password || !value) {
    return false;
  }

  const [issuedAtRaw, signature] = value.split(".");
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || !signature) {
    return false;
  }

  if (issuedAt + SESSION_TTL_SECONDS * 1000 <= Date.now()) {
    return false;
  }

  return timingSafeEqualString(signature, signSession(issuedAt, password));
}

export async function hasConsoleSession() {
  const cookieStore = await cookies();
  return isValidConsoleSession(cookieStore.get(COOKIE_NAME)?.value);
}

export function requireConsoleApi(request: NextRequest) {
  const limit = checkRateLimit(request);
  if (limit.limited) {
    return rateLimitError();
  }

  const origin = request.headers.get("origin");
  if (
    origin &&
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    origin !== request.nextUrl.origin
  ) {
    return jsonError("Invalid request origin.", 403);
  }

  if (!isValidConsoleSession(request.cookies.get(COOKIE_NAME)?.value)) {
    return jsonError("Console authentication required.", 401);
  }

  return null;
}

export function setConsoleSessionCookie(response: NextResponse, value: string) {
  response.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/"
  });
}

export function clearConsoleSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
}
