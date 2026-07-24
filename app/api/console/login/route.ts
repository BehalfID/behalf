import { NextResponse, type NextRequest } from "next/server";
import {
  createConsoleAdminSessionValue,
  createConsoleSessionValue,
  requireConsoleMutationOrigin,
  setConsoleSessionCookie,
  verifyAdminPassword
} from "@/lib/adminAuth";
import { recordAuthFailure } from "@/lib/authEvents";
import {
  allowSharedConsoleAdmin,
  authenticateConsoleAdmin,
  countConsoleAdmins,
  createConsoleAdmin,
  recordAdminAudit
} from "@/lib/consoleAdmins";
import { checkAuthRateLimit, checkRateLimit, rateLimitError } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/request";
import { jsonError } from "@/lib/responses";
import { readString, rejectUnknownFields } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const originError = requireConsoleMutationOrigin(request);
  if (originError) {
    return originError;
  }

  const limit = await checkRateLimit(request);
  if (limit.limited) {
    return rateLimitError();
  }

  const authLimit = await checkAuthRateLimit("console");
  if (authLimit.limited) {
    return rateLimitError();
  }

  const { body, error } = await readJsonObject(request);
  if (error) return error;
  if (!body) return jsonError("Request body must be a JSON object.");

  const unknownError = rejectUnknownFields(body, [
    "password",
    "email",
    "action",
    "bootstrapEmail",
    "bootstrapPassword"
  ]);
  if (unknownError) {
    return jsonError(unknownError);
  }

  const action = readString(body.action);
  const password = readString(body.password);
  const email = readString(body.email);

  if (action === "bootstrap") {
    const adminCount = await countConsoleAdmins();
    if (adminCount > 0) {
      return jsonError("Console admins already exist. Sign in with email and password.", 400);
    }
    if (!verifyAdminPassword(password)) {
      await recordAuthFailure({
        request,
        surface: "console_login",
        reason: "invalid_credentials",
        identityHint: "console:bootstrap"
      });
      return jsonError("Invalid shared console password.", 401);
    }
    const bootstrapEmail = readString(body.bootstrapEmail);
    const bootstrapPassword = readString(body.bootstrapPassword);
    if (!bootstrapEmail.includes("@") || bootstrapPassword.length < 12) {
      return jsonError("Bootstrap requires email and a password of at least 12 characters.");
    }
    const adminId = await createConsoleAdmin({
      email: bootstrapEmail,
      password: bootstrapPassword,
      role: "owner"
    });
    await recordAdminAudit({
      adminId,
      action: "console_admin.bootstrap",
      target: bootstrapEmail
    });
    const session = createConsoleAdminSessionValue(adminId);
    const response = NextResponse.json({ authenticated: true, adminId, mode: "admin" });
    setConsoleSessionCookie(response, session);
    return response;
  }

  if (email) {
    const admin = await authenticateConsoleAdmin(email, password);
    if (!admin) {
      await recordAuthFailure({
        request,
        surface: "console_login",
        reason: "invalid_credentials",
        email
      });
      return jsonError("Invalid email or password.", 401);
    }
    await recordAdminAudit({
      adminId: admin.adminId,
      action: "console_admin.login",
      target: admin.email
    });
    const session = createConsoleAdminSessionValue(admin.adminId);
    const response = NextResponse.json({
      authenticated: true,
      adminId: admin.adminId,
      mode: "admin"
    });
    setConsoleSessionCookie(response, session);
    return response;
  }

  const adminCount = await countConsoleAdmins();
  if (adminCount > 0 && !allowSharedConsoleAdmin()) {
    return jsonError("Use your console admin email and password.", 401);
  }

  if (!verifyAdminPassword(password)) {
    await recordAuthFailure({
      request,
      surface: "console_login",
      reason: "invalid_credentials",
      identityHint: "console:shared"
    });
    return jsonError("Invalid console password.", 401);
  }

  const session = createConsoleSessionValue();
  if (!session) {
    return jsonError("Console password is not configured.", 500);
  }

  const response = NextResponse.json({ authenticated: true, mode: "shared" });
  setConsoleSessionCookie(response, session);
  return response;
}
