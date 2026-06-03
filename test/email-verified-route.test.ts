import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests that unverified users cannot create agents or developer tokens.

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  requireVerifiedDeveloperApi: vi.fn(),
  connectToDatabase: vi.fn(),
  agentFind: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: mocks.requireDeveloperApi,
  requireVerifiedDeveloperApi: mocks.requireVerifiedDeveloperApi
}));
vi.mock("@/lib/db", () => ({ connectToDatabase: mocks.connectToDatabase }));
vi.mock("@/models/Agent", () => ({
  default: { find: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) }) }
}));
vi.mock("@/models/DeveloperApiToken", () => ({
  default: { find: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) }
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ limited: false }),
  rateLimitError: () => Response.json({ error: "Rate limit exceeded." }, { status: 429 })
}));

const unverifiedError = Response.json(
  { error: "Email verification required. Check your inbox or resend the verification email." },
  { status: 403 }
);

function postRequest(url: string) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
    body: JSON.stringify({ name: "Test" })
  }) as never;
}

describe("unverified user access restrictions", () => {
  beforeEach(() => {
    mocks.connectToDatabase.mockResolvedValue(undefined);
    // requireVerifiedDeveloperApi returns 403 for unverified user
    mocks.requireVerifiedDeveloperApi.mockResolvedValue({
      user: null,
      account: null,
      error: unverifiedError
    });
    // requireDeveloperApi still passes (GET is allowed)
    mocks.requireDeveloperApi.mockResolvedValue({
      user: { userId: "user_test", email: "dev@example.com", emailVerified: false },
      account: null,
      error: null
    });
  });

  it("blocks POST /api/dashboard/agents for unverified user", async () => {
    const { POST } = await import("@/app/api/dashboard/agents/route");
    const res = await POST(postRequest("http://localhost:3000/api/dashboard/agents"));
    expect(res.status).toBe(403);
  });

  it("blocks POST /api/dashboard/tokens for unverified user", async () => {
    const { POST } = await import("@/app/api/dashboard/tokens/route");
    const res = await POST(postRequest("http://localhost:3000/api/dashboard/tokens"));
    expect(res.status).toBe(403);
  });

  it("allows GET /api/dashboard/agents for unverified user (read-only)", async () => {
    const { GET } = await import("@/app/api/dashboard/agents/route");
    const req = new Request("http://localhost:3000/api/dashboard/agents") as never;
    const res = await GET(req);
    // GET uses requireDeveloperApi (not verified), so it succeeds
    expect(res.status).toBe(200);
  });
});
