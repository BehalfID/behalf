import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEndpoint: vi.fn(),
  requireWorkspaceMutationActor: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireDeveloperApi: vi.fn().mockResolvedValue({
    error: null,
    user: { userId: "usr_viewer", primaryAccountId: "acct_1" },
    account: { accountId: "acct_1", plan: "pro" },
    activeAccountId: "acct_1"
  })
}));
vi.mock("@/lib/workspaceActor", () => ({
  requireWorkspaceMutationActor: mocks.requireWorkspaceMutationActor
}));
vi.mock("@/lib/repositories/webhooks", () => ({
  createEndpoint: mocks.createEndpoint,
  listEndpoints: vi.fn()
}));

describe("POST /api/dashboard/webhooks", () => {
  it("refuses VIEWERs before creating an endpoint", async () => {
    mocks.requireWorkspaceMutationActor.mockResolvedValue({
      actor: null,
      error: Response.json({ error: "forbidden" }, { status: 403 })
    });
    const { POST } = await import("@/app/api/dashboard/webhooks/route");
    const response = await POST(
      new Request("http://localhost/api/dashboard/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://hooks.example.com/x", events: ["verification.allowed"] })
      }) as never
    );
    expect(response.status).toBe(403);
    expect(mocks.requireWorkspaceMutationActor).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "usr_viewer" }),
      "acct_1"
    );
    expect(mocks.createEndpoint).not.toHaveBeenCalled();
  });
});
