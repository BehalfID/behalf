import { describe, expect, it } from "vitest";
import {
  agentAuthJsonError,
  appErrorDetails,
  jsonAppError,
  type AppErrorCode
} from "@/lib/appErrors";
import { jsonError } from "@/lib/responses";
import { PRIVATE_NO_STORE } from "@/lib/cachePolicy";

describe("appErrorDetails", () => {
  it("includes code and default hint", () => {
    const details = appErrorDetails("AUTH_REQUIRED");
    expect(details.code).toBe("AUTH_REQUIRED");
    expect(details.hint).toMatch(/behalf login/i);
  });

  it("allows overriding or suppressing hint", () => {
    expect(appErrorDetails("NOT_FOUND", "Custom hint").hint).toBe("Custom hint");
    expect(appErrorDetails("NOT_FOUND", null).hint).toBeUndefined();
  });
});

describe("jsonAppError / jsonError compatibility", () => {
  it("emits { error, code, hint } without breaking plain jsonError callers", async () => {
    const coded = jsonAppError("Developer authentication required.", 401, "AUTH_REQUIRED");
    expect(coded.status).toBe(401);
    expect(coded.headers.get("Cache-Control")).toBe(PRIVATE_NO_STORE);
    await expect(coded.json()).resolves.toEqual({
      error: "Developer authentication required.",
      code: "AUTH_REQUIRED",
      hint: expect.any(String)
    });

    const plain = jsonError("Nope", 400);
    expect(plain.status).toBe(400);
    await expect(plain.json()).resolves.toEqual({ error: "Nope" });

    const withExtra = jsonError("Quota", 429, { code: "VERIFICATION_LIMIT_REACHED", upgradeHint: "Upgrade" });
    await expect(withExtra.json()).resolves.toEqual({
      error: "Quota",
      code: "VERIFICATION_LIMIT_REACHED",
      upgradeHint: "Upgrade"
    });
  });

  it("covers every AppErrorCode with a stable string value", () => {
    const codes: AppErrorCode[] = [
      "AUTH_REQUIRED",
      "EMAIL_VERIFICATION_REQUIRED",
      "INVALID_ORIGIN",
      "INVALID_DEVELOPER_TOKEN",
      "SESSION_REQUIRED",
      "AGENT_AUTH_REQUIRED",
      "AGENT_API_KEY_MISMATCH",
      "AGENT_NOT_FOUND",
      "AGENT_ACCOUNT_MISMATCH",
      "WORKSPACE_NOT_FOUND",
      "WORKSPACE_ACCESS_DENIED",
      "WORKSPACE_ACCOUNT_REQUIRED",
      "AUTHORITY_FORBIDDEN",
      "VIEWER_MUTATION_FORBIDDEN",
      "RATE_LIMIT_EXCEEDED",
      "VERIFY_FAILED_CLOSED",
      "NOT_FOUND"
    ];
    for (const code of codes) {
      expect(appErrorDetails(code).code).toBe(code);
    }
  });
});

describe("agentAuthJsonError", () => {
  it("maps agent auth failure strings to codes and statuses", async () => {
    const missing = agentAuthJsonError("Missing or invalid API key.");
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toMatchObject({
      error: "Missing or invalid API key.",
      code: "AGENT_AUTH_REQUIRED"
    });

    const mismatch = agentAuthJsonError("API key does not match this agent.");
    expect(mismatch.status).toBe(401);
    await expect(mismatch.json()).resolves.toMatchObject({
      code: "AGENT_API_KEY_MISMATCH"
    });

    const unknown = agentAuthJsonError("Unknown agent.");
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toMatchObject({
      code: "AGENT_NOT_FOUND"
    });
  });
});
