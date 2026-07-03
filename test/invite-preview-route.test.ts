import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  connectToDatabase: vi.fn(),
  getInvitePreview: vi.fn()
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitError: () => new Response(null, { status: 429 })
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: mocks.connectToDatabase
}));

vi.mock("@/lib/inviteAcceptance", () => ({
  getInvitePreview: mocks.getInvitePreview
}));

function previewRequest(token: string) {
  return new NextRequest(`http://localhost/api/invites/${encodeURIComponent(token)}`);
}

describe("GET /api/invites/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ limited: false });
    mocks.connectToDatabase.mockResolvedValue(undefined);
  });

  it("connects to the database before loading invite preview", async () => {
    mocks.getInvitePreview.mockResolvedValue({
      status: "pending",
      email: "invited@example.com",
      role: "ENGINEER",
      accountId: "acct_team",
      accountName: "Team Workspace",
      invitedBy: "user_owner",
      expiresAt: null
    });

    const { GET } = await import("@/app/api/invites/[token]/route");
    const response = await GET(previewRequest("tok_preview"), {
      params: Promise.resolve({ token: "tok_preview" })
    });

    expect(response.status).toBe(200);
    expect(mocks.connectToDatabase).toHaveBeenCalledTimes(1);
    expect(mocks.getInvitePreview).toHaveBeenCalledWith("tok_preview");
  });

  it("returns 404 for unknown invite token", async () => {
    mocks.getInvitePreview.mockResolvedValue(null);

    const { GET } = await import("@/app/api/invites/[token]/route");
    const response = await GET(previewRequest("missing"), {
      params: Promise.resolve({ token: "missing" })
    });

    expect(response.status).toBe(404);
    expect(mocks.connectToDatabase).toHaveBeenCalledTimes(1);
  });
});
