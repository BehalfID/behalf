import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { promisify } from "util";
import { connectToDatabase } from "@/lib/db";
import { createPublicId } from "@/lib/ids";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { jsonError } from "@/lib/responses";
import Account, { type AccountDocument } from "@/models/Account";
import DeveloperSession from "@/models/DeveloperSession";
import DeveloperUser, { type DeveloperUserDocument } from "@/models/DeveloperUser";

const scryptAsync = promisify(crypto.scrypt);
const COOKIE_NAME = "behalfid_developer";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function isValidPassword(password: string) {
  return password.length >= 10 && password.length <= 200;
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }

  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "base64url");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Hash an email verification or password reset token for storage. Never log the raw token. */
export function hashEmailToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Generate a cryptographically secure URL-safe token. */
export function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Returns true if this user's email is considered verified.
 * Accounts created before email verification was introduced (emailVerified === undefined/null)
 * are treated as verified to avoid locking out existing users.
 */
export function isEmailVerified(emailVerified: boolean | null | undefined): boolean {
  return emailVerified !== false;
}

export async function createDeveloperSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const session = await DeveloperSession.create({
    sessionId: createPublicId("sess"),
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS)
  });

  return { token, session };
}

export function setDeveloperSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    path: "/"
  });
}

export function clearDeveloperSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
}

function normalizeOrigin(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowedOrigins(request: NextRequest) {
  const origins = new Set<string>([request.nextUrl.origin]);
  const appUrl = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const vercelUrl = process.env.VERCEL_URL ? normalizeOrigin(`https://${process.env.VERCEL_URL}`) : null;
  if (appUrl) origins.add(appUrl);
  if (vercelUrl) origins.add(vercelUrl);
  return origins;
}

export function requireDashboardMutationOrigin(request: NextRequest) {
  if (!MUTATION_METHODS.has(request.method)) {
    return null;
  }

  const origin = normalizeOrigin(request.headers.get("origin"));
  if (!origin || !allowedOrigins(request).has(origin)) {
    return jsonError("Invalid request origin.", 403);
  }

  return null;
}

export async function getDeveloperFromToken(token?: string | null) {
  if (!token) return null;
  await connectToDatabase();
  const tokenHash = hashSessionToken(token);
  const session = await DeveloperSession.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() }
  }).lean();

  if (!session) return null;
  const user = await DeveloperUser.findOne({ userId: session.userId })
    .select("-_id userId email emailVerified onboardingUseCase primaryAccountId firstName lastName jobTitle onboardingCompletedAt createdAt updatedAt")
    .lean();

  return user;
}

export async function getCurrentDeveloper() {
  const cookieStore = await cookies();
  return getDeveloperFromToken(cookieStore.get(COOKIE_NAME)?.value);
}

export async function requireDeveloperApi(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) {
    return { user: null, account: null, error: rateLimitError() };
  }

  const originError = requireDashboardMutationOrigin(request);
  if (originError) {
    return { user: null, account: null, error: originError };
  }

  const user = await getDeveloperFromToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!user) {
    return { user: null, account: null, error: jsonError("Developer authentication required.", 401) };
  }

  const pathname = request.nextUrl.pathname;
  const isAccountSetupApi = pathname.startsWith("/api/onboarding/");
  if (
    !isAccountSetupApi &&
    MUTATION_METHODS.has(request.method) &&
    !isEmailVerified(user.emailVerified)
  ) {
    return {
      user: null,
      account: null,
      error: jsonError("Email verification required. Check your inbox or resend the verification email.", 403)
    };
  }

  const account = user.primaryAccountId
    ? await Account.findOne({ accountId: user.primaryAccountId }).lean()
    : null;

  return { user, account, error: null };
}

/** Like requireDeveloperApi but also requires emailVerified (or pre-verification account). */
export async function requireVerifiedDeveloperApi(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth;
  if (!isEmailVerified(auth.user.emailVerified)) {
    return {
      user: null,
      account: null,
      error: jsonError("Email verification required. Check your inbox or resend the verification email.", 403)
    };
  }
  return auth;
}

export type DeveloperPublic = Pick<DeveloperUserDocument, "userId" | "email" | "createdAt" | "updatedAt">;
export type DeveloperAccount = AccountDocument | null;
