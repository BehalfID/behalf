import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";

const COOKIE_NAME = "behalfid_console";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UNSAFE_ADMIN_PASSWORDS = new Set(["change-me", "changeme", "password", "admin"]);

function getAdminPassword() {
  const password = process.env.BEHALFID_ADMIN_PASSWORD?.trim() ?? "";
  if (process.env.NODE_ENV === "production" && UNSAFE_ADMIN_PASSWORDS.has(password.toLowerCase())) {
    return "";
  }

  return password;
}

export function isPublicAgentCreationEnabled() {
  return process.env.BEHALFID_PUBLIC_AGENT_CREATION === "true";
}

export function isSetupTokenConfigured() {
  return Boolean(process.env.BEHALFID_SETUP_TOKEN?.trim());
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

function normalizeOrigin(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedConsoleOrigins(request: NextRequest) {
  const origins = new Set<string>([request.nextUrl.origin]);
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const vercelOrigin = process.env.VERCEL_URL
    ? normalizeOrigin(`https://${process.env.VERCEL_URL}`)
    : null;

  if (configuredOrigin) {
    origins.add(configuredOrigin);
  }

  if (vercelOrigin) {
    origins.add(vercelOrigin);
  }

  return origins;
}

export function requireConsoleMutationOrigin(request: NextRequest) {
  if (!MUTATION_METHODS.has(request.method)) {
    return null;
  }

  const origin = normalizeOrigin(request.headers.get("origin"));
  if (!origin || !getAllowedConsoleOrigins(request).has(origin)) {
    return jsonError("Invalid request origin.", 403);
  }

  return null;
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

export function verifySetupToken(candidate: string) {
  const token = process.env.BEHALFID_SETUP_TOKEN?.trim() ?? "";
  if (!token || !candidate) {
    return false;
  }

  return timingSafeEqualString(
    crypto.createHash("sha256").update(candidate).digest("hex"),
    crypto.createHash("sha256").update(token).digest("hex")
  );
}

export function getSetupToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token, extra] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    return null;
  }

  return token;
}

export function hasValidSetupToken(request: NextRequest) {
  return verifySetupToken(getSetupToken(request) ?? "");
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

export async function requireConsoleApi(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) {
    return rateLimitError();
  }

  const originError = requireConsoleMutationOrigin(request);
  if (originError) {
    return originError;
  }

  if (!isValidConsoleSession(request.cookies.get(COOKIE_NAME)?.value)) {
    return jsonError("Console authentication required.", 401);
  }

  return null;
}

export function requireSetupTokenOrConsoleSession(request: NextRequest) {
  if (hasValidSetupToken(request)) {
    return null;
  }

  if (!isValidConsoleSession(request.cookies.get(COOKIE_NAME)?.value)) {
    return jsonError("Agent creation is disabled for public requests.", 403);
  }

  const originError = requireConsoleMutationOrigin(request);
  if (originError) {
    return originError;
  }

  return null;
}

export function requireSetupTokenOrConsoleApi(request: NextRequest) {
  if (hasValidSetupToken(request)) {
    return null;
  }

  if (!isValidConsoleSession(request.cookies.get(COOKIE_NAME)?.value)) {
    return jsonError("Console authentication or setup token required.", 401);
  }

  const originError = requireConsoleMutationOrigin(request);
  if (originError) {
    return originError;
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
