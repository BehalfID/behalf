import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  authenticateApiKey: vi.fn(),
}));

vi.mock("@/lib/developerAuth", () => ({
  DEVELOPER_SESSION_COOKIE_NAME: "behalf" + "id_developer",
  getDeveloperFromToken: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: vi.fn(async () => {}),
}));

describe("requireDeveloperSessionForPause", () => {
  beforeEach(async () => {
    vi.resetModules();
    const auth = await import("@/lib/auth");
    const developerAuth = await import("@/lib/developerAuth");
    vi.mocked(developerAuth.getDeveloperFromToken).mockResolvedValue(null);
    vi.mocked(auth.authenticateApiKey).mockResolvedValue({
      agent: { agentId: "agent_a", accountId: "acct_a" } as never,
      error: null,
    });
  });

  it("rejects agent-authenticated pause requests with 403", async () => {
    const { requireDeveloperSessionForPause } = await import("@/lib/cliAuth");
    const req = {
      cookies: { get: () => undefined },
    } as never;
    const result = await requireDeveloperSessionForPause(req);
    expect(result.auth).toBeNull();
    expect(result.error).toBeTruthy();
    expect((result.error as Response).status).toBe(403);
  });

  it("rejects anonymous pause requests with 401", async () => {
    const auth = await import("@/lib/auth");
    vi.mocked(auth.authenticateApiKey).mockResolvedValue({
      agent: null,
      error: "Missing or invalid API key.",
    });
    const { requireDeveloperSessionForPause } = await import("@/lib/cliAuth");
    const req = { cookies: { get: () => undefined } } as never;
    const result = await requireDeveloperSessionForPause(req);
    expect(result.auth).toBeNull();
    expect((result.error as Response).status).toBe(401);
  });
});
