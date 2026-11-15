import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  requireWorkspaceMutationActor: vi.fn(),
  updateEndpoint: vi.fn(),
  findOneAndUpdateEndpoint: vi.fn(),
  findOneRule: vi.fn(),
  findOneAndUpdateRule: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({ requireDeveloperApi: mocks.requireDeveloperApi }));
vi.mock("@/lib/workspaceActor", () => ({
  requireWorkspaceMutationActor: mocks.requireWorkspaceMutationActor
}));
vi.mock("@/lib/repositories/webhooks", () => ({
  updateEndpoint: mocks.updateEndpoint,
  findOneAndUpdateEndpoint: mocks.findOneAndUpdateEndpoint
}));
vi.mock("@/lib/repositories/sites", () => ({
  findOneRule: mocks.findOneRule,
  findOneAndUpdateRule: mocks.findOneAndUpdateRule
}));

const params = (value: Record<string, string>) => ({ params: Promise.resolve(value) });
const post = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? "POST" : "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireDeveloperApi.mockResolvedValue({
    error: null,
    user: { userId: "usr_1", primaryAccountId: "acct_personal" },
    account: { accountId: "acct_pro", plan: "pro" },
    activeAccountId: "acct_pro"
  });
  mocks.requireWorkspaceMutationActor.mockResolvedValue({
    actor: { accountId: "acct_pro", userId: "usr_1", role: "OWNER" },
    error: null
  });
  mocks.updateEndpoint.mockResolvedValue({ matchedCount: 0 });
  mocks.findOneAndUpdateEndpoint.mockResolvedValue(null);
  mocks.findOneRule.mockResolvedValue(null);
});

describe("per-webhook mutations are scoped to the active workspace", () => {
  it("enable only matches endpoints in the active (quota-checked) workspace", async () => {
    const { POST } = await import("@/app/api/dashboard/webhooks/[webhookId]/enable/route");
    const response = await POST(post("http://localhost/x"), params({ webhookId: "wh_other_ws" }));
    expect(response.status).toBe(404);
    expect(mocks.updateEndpoint).toHaveBeenCalledWith(
      { developerUserId: "usr_1", accountId: "acct_pro", webhookId: "wh_other_ws" },
      { $set: { status: "active" } }
    );
  });

  it("enable and rotate-secret refuse VIEWERs", async () => {
    mocks.requireWorkspaceMutationActor.mockResolvedValue({
      actor: null,
      error: Response.json({ error: "forbidden" }, { status: 403 })
    });
    const enable = await import("@/app/api/dashboard/webhooks/[webhookId]/enable/route");
    const rotate = await import("@/app/api/dashboard/webhooks/[webhookId]/rotate-secret/route");
    expect((await enable.POST(post("http://localhost/x"), params({ webhookId: "wh_1" }))).status).toBe(403);
    expect((await rotate.POST(post("http://localhost/x"), params({ webhookId: "wh_1" }))).status).toBe(403);
    expect(mocks.updateEndpoint).not.toHaveBeenCalled();
    expect(mocks.findOneAndUpdateEndpoint).not.toHaveBeenCalled();
  });

  it("rotate-secret and disable filter by workspace", async () => {
    const rotate = await import("@/app/api/dashboard/webhooks/[webhookId]/rotate-secret/route");
    await rotate.POST(post("http://localhost/x"), params({ webhookId: "wh_1" }));
    expect(mocks.findOneAndUpdateEndpoint.mock.calls[0]![0]).toEqual({
      developerUserId: "usr_1",
      accountId: "acct_pro",
      webhookId: "wh_1"
    });
    const disable = await import("@/app/api/dashboard/webhooks/[webhookId]/disable/route");
    await disable.POST(post("http://localhost/x"), params({ webhookId: "wh_1" }));
    expect(mocks.updateEndpoint.mock.calls[0]![0]).toEqual({
      developerUserId: "usr_1",
      accountId: "acct_pro",
      webhookId: "wh_1"
    });
  });
});

describe("PATCH Site Guard rule is scoped to the acting workspace", () => {
  it("does not find a rule on a site in another workspace", async () => {
    const { PATCH } = await import("@/app/api/dashboard/sites/[siteId]/rules/[ruleId]/route");
    const response = await PATCH(
      post("http://localhost/x", { status: "disabled" }),
      params({ siteId: "site_w", ruleId: "rule_w" })
    );
    expect(response.status).toBe(404);
    expect(mocks.findOneRule).toHaveBeenCalledWith({
      developerUserId: "usr_1",
      accountId: "acct_pro",
      siteId: "site_w",
      ruleId: "rule_w"
    });
    expect(mocks.findOneAndUpdateRule).not.toHaveBeenCalled();
  });

  it("updates with the workspace in the filter", async () => {
    mocks.findOneRule.mockResolvedValue({ ruleId: "rule_1", agentIdentifier: "bot" });
    mocks.findOneAndUpdateRule.mockResolvedValue({ ruleId: "rule_1", status: "disabled" });
    const { PATCH } = await import("@/app/api/dashboard/sites/[siteId]/rules/[ruleId]/route");
    const response = await PATCH(
      post("http://localhost/x", { status: "disabled" }),
      params({ siteId: "site_1", ruleId: "rule_1" })
    );
    expect(response.status).toBe(200);
    expect(mocks.findOneAndUpdateRule.mock.calls[0]![0]).toEqual({
      developerUserId: "usr_1",
      accountId: "acct_pro",
      siteId: "site_1",
      ruleId: "rule_1"
    });
  });
});
