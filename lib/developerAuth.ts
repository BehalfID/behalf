import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { cache } from "react";
import { promisify } from "util";
import { jsonAppError } from "@/lib/appErrors";
import { connectToDatabase } from "@/lib/db";
import { requireWorkspaceMembershipBySlug, resolveActiveAccountId } from "@/lib/accountContext";
import { createPublicId } from "@/lib/ids";
import { checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { sessionCookieOptions } from "@/lib/sessionCookies";
import { WORKSPACE_SLUG_HEADER } from "@/lib/workspaceSlug";
import { isUnverifiedAuthApiPath } from "@/lib/emailVerificationGuard";
import Account, { type AccountDocument } from "@/models/Account";
import DeveloperSession from "@/models/DeveloperSession";
import DeveloperUser, { type DeveloperUserDocument } from "@/models/DeveloperUser";

const scryptAsync = promisify(crypto.scrypt);
const COOKIE_NAME = "behalfid_developer";
export { COOKIE_NAME as DEVELOPER_SESSION_COOKIE_NAME };
/** Sliding inactivity window before a session is invalidated. */
export const SESSION_INACTIVITY_MS = 1000 * 60 * 60;
/** Absolute maximum session lifetime from creation. */
const SESSION_ABSOLUTE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const SESSION_ACTIVITY_TOUCH_INTERVAL_MS = 1000 * 60;
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

function sessionExpiryFromNow() {
  return new Date(Date.now() + SESSION_INACTIVITY_MS);
}

export async function createDeveloperSession(userId: string) {
  const now = new Date();
  const token = crypto.randomBytes(32).toString("base64url");
  const session = await DeveloperSession.create({
    sessionId: createPublicId("sess"),
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: sessionExpiryFromNow(),
    lastActivityAt: now
  });

  return { token, session };
}

export function setDeveloperSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(
    COOKIE_NAME,
    token,
    sessionCookieOptions({ maxAge: Math.floor(SESSION_INACTIVITY_MS / 1000) })
  );
}

function isSessionInactive(lastActivityAt: Date | string | undefined, createdAt: Date | string | undefined) {
  const now = Date.now();
  const activityMs = lastActivityAt
    ? new Date(lastActivityAt).getTime()
    : createdAt
      ? new Date(createdAt).getTime()
      : now;

  if (now - activityMs > SESSION_INACTIVITY_MS) {
    return true;
  }

  const created = createdAt ? new Date(createdAt).getTime() : 0;
  return created > 0 && now - created > SESSION_ABSOLUTE_TTL_MS;
}

async function touchDeveloperSession(session: {
  sessionId: string;
  lastActivityAt?: Date | string;
}) {
  const lastActivity = session.lastActivityAt ? new Date(session.lastActivityAt).getTime() : 0;
  if (Date.now() - lastActivity < SESSION_ACTIVITY_TOUCH_INTERVAL_MS) {
    return;
  }

  try {
    await DeveloperSession.updateOne(
      { sessionId: session.sessionId },
      { $set: { lastActivityAt: new Date(), expiresAt: sessionExpiryFromNow() } }
    );
  } catch {
    // Best-effort sliding refresh; auth still succeeds on this request.
  }
}

export async function refreshDeveloperSessionActivity(token: string) {
  await connectToDatabase();
  const tokenHash = hashSessionToken(token);
  const session = await DeveloperSession.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() }
  }).lean();

  if (!session || isSessionInactive(session.lastActivityAt, session.createdAt)) {
    if (session) {
      await DeveloperSession.deleteOne({ sessionId: session.sessionId });
    }
    return null;
  }

  await touchDeveloperSession(session);
  return session;
}

export function clearDeveloperSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    ...sessionCookieOptions({ maxAge: 0 }),
    maxAge: 0
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
    return jsonAppError("Invalid request origin.", 403, "INVALID_ORIGIN");
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

  if (isSessionInactive(session.lastActivityAt, session.createdAt)) {
    await DeveloperSession.deleteOne({ sessionId: session.sessionId });
    return null;
  }

  await touchDeveloperSession(session);
  const user = await DeveloperUser.findOne({ userId: session.userId })
    .select("-_id userId email emailVerified onboardingUseCase primaryAccountId firstName lastName jobTitle onboardingCompletedAt createdAt updatedAt")
    .lean();

  if (!user) return null;

  const activeAccountId = await resolveActiveAccountId(user.userId, {
    sessionActiveAccountId: session.activeAccountId,
    sessionId: session.sessionId,
    primaryAccountId: user.primaryAccountId
  });

  return { user, session, activeAccountId };
}

/** @deprecated Prefer getDeveloperFromToken which includes active account context. */
export async function getDeveloperUserFromToken(token?: string | null) {
  const context = await getDeveloperFromToken(token);
  return context?.user ?? null;
}

const getCurrentDeveloperContextForRequest = cache(async () => {
  const cookieStore = await cookies();
  return getDeveloperFromToken(cookieStore.get(COOKIE_NAME)?.value);
});

export async function getCurrentDeveloper() {
  const context = await getCurrentDeveloperContextForRequest();
  return context?.user ?? null;
}

export async function getCurrentDeveloperContext() {
  return getCurrentDeveloperContextForRequest();
}

export type ServerSessionStatus = {
  sessionId: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  inactivityMs: number;
};

/** Read and validate the current developer session from request cookies (server-only). */
export async function checkSessionOnServer(): Promise<ServerSessionStatus | null> {
  const cookieStore = await cookies();
  const context = await getDeveloperFromToken(cookieStore.get(COOKIE_NAME)?.value);
  if (!context) return null;

  return {
    sessionId: context.session.sessionId,
    userId: context.user.userId,
    email: context.user.email,
    emailVerified: context.user.emailVerified !== false,
    inactivityMs: SESSION_INACTIVITY_MS
  };
}

function readTrustedWorkspaceSlug(request: NextRequest): string | null {
  const slug = request.headers.get(WORKSPACE_SLUG_HEADER)?.trim().toLowerCase() ?? "";
  return slug || null;
}

/**
 * Authenticate a dashboard API request.
 * When the proxy attaches a trusted workspace slug header, tenancy is taken from
 * that slug (membership-verified) for this request only — session activeAccountId
 * is ignored. Legacy requests without a slug keep session-scoped behavior.
 */
export async function requireDeveloperApi(request: NextRequest) {
  const limit = await checkRateLimit(request);
  if (limit.limited) {
    return {
      user: null,
      account: null,
      activeAccountId: null,
      session: null,
      workspaceSlug: null,
      error: rateLimitError()
    };
  }

  const originError = requireDashboardMutationOrigin(request);
  if (originError) {
    return {
      user: null,
      account: null,
      activeAccountId: null,
      session: null,
      workspaceSlug: null,
      error: originError
    };
  }

  const context = await getDeveloperFromToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!context) {
    return {
      user: null,
      account: null,
      activeAccountId: null,
      session: null,
      workspaceSlug: null,
      error: jsonAppError("Developer authentication required.", 401, "AUTH_REQUIRED")
    };
  }

  const { user, session } = context;

  const pathname = request.nextUrl.pathname;
  if (!isEmailVerified(user.emailVerified) && !isUnverifiedAuthApiPath(pathname)) {
    return {
      user: null,
      account: null,
      activeAccountId: null,
      session: null,
      workspaceSlug: null,
      error: jsonAppError(
        "Email verification required. Check your inbox or resend the verification email.",
        403,
        "EMAIL_VERIFICATION_REQUIRED"
      )
    };
  }

  const workspaceSlug = readTrustedWorkspaceSlug(request);
  if (workspaceSlug) {
    const resolved = await requireWorkspaceMembershipBySlug(user.userId, workspaceSlug);
    if ("error" in resolved) {
      return {
        user: null,
        account: null,
        activeAccountId: null,
        session: null,
        workspaceSlug: null,
        error: resolved.error
      };
    }

    const account = await Account.findOne({ accountId: resolved.workspace.accountId }).lean();
    return {
      user,
      account,
      activeAccountId: resolved.workspace.accountId,
      session,
      workspaceSlug: resolved.workspace.slug,
      error: null
    };
  }

  const { activeAccountId } = context;
  const account = activeAccountId
    ? await Account.findOne({ accountId: activeAccountId }).lean()
    : null;

  return { user, account, activeAccountId, session, workspaceSlug: null, error: null };
}

/**
 * Prefer this for workspace-scoped dashboard APIs. Equivalent to requireDeveloperApi
 * when the trusted slug header is present; documents intent for callers.
 */
export async function requireWorkspaceDeveloperApi(request: NextRequest) {
  return requireDeveloperApi(request);
}

/** Like requireDeveloperApi but also requires emailVerified (or pre-verification account). */
export async function requireVerifiedDeveloperApi(request: NextRequest) {
  const auth = await requireDeveloperApi(request);
  if (auth.error || !auth.user) return auth;
  if (!isEmailVerified(auth.user.emailVerified)) {
    return {
      user: null,
      account: null,
      activeAccountId: null,
      session: null,
      workspaceSlug: null,
      error: jsonAppError(
        "Email verification required. Check your inbox or resend the verification email.",
        403,
        "EMAIL_VERIFICATION_REQUIRED"
      )
    };
  }
  return auth;
}

export type DeveloperPublic = Pick<DeveloperUserDocument, "userId" | "email" | "createdAt" | "updatedAt">;
export type DeveloperAccount = AccountDocument | null;

export function getRequestAccountId(auth: {
  activeAccountId?: string | null;
  user?: { primaryAccountId?: string | null } | null;
}) {
  return auth.activeAccountId ?? auth.user?.primaryAccountId ?? null;
}
