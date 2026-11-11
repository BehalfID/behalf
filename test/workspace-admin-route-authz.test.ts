/**
 * Regression tests for workspace-admin authorization on the Slack identity
 * map and guardrail policy routes. Both previously only blocked VIEWERs, so an
 * ENGINEER could map their Slack account to an OWNER (and approve as that
 * owner from Slack) or install an auto_approve policy that skipped every human
 * approval gate in the workspace.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  findMembershipByAccountAndUser: vi.fn(),
  createSlackBinding: vi.fn(),
  upsertIdentityMapping: vi.fn(),
  disableIntegrationBinding: vi.fn(),
  listIntegrationBindings: vi.fn(),
  findPolicyByAccountId: vi.fn(),
  upsertPolicyDocument: vi.fn(),
  deletePolicyDocument: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({ requireDeveloperApi: mocks.requireDeveloperApi }));
vi.mock("@/lib/delegatedAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/delegatedAuth")>();
  return { ...actual, getWorkspaceActor: mocks.getWorkspaceActor };
});
vi.mock("@/lib/repositories/memberships", () => ({
  findMembershipByAccountAndUser: mocks.findMembershipByAccountAndUser
}));
vi.mock("@/lib/repositories/integrationBindings", () => ({
  createSlackBinding: mocks.createSlackBinding,
  upsertIdentityMapping: mocks.upsertIdentityMapping,
  disableIntegrationBinding: mocks.disableIntegrationBinding,
  listIntegrationBindings: mocks.listIntegrationBindings
}));
vi.mock("@/lib/repositories/policyDocuments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/policyDocuments")>();
  return {
    ...actual,
    findPolicyByAccountId: mocks.findPolicyByAccountId,
    upsertPolicyDocument: mocks.upsertPolicyDocument,
    deletePolicyDocument: mocks.deletePolicyDocument,
    toStoredPolicyDocument: (doc: unknown) => doc
  };
});
vi.mock("@/lib/policyEngine/loadPolicy", () => ({ invalidatePolicyDocumentCache: vi.fn() }));

const ACTORS = {
  OWNER: { userId: "user_owner", accountId: "acct_1", role: "OWNER", authorityLevel: 100 },
  LEAD: { userId: "user_lead", accountId: "acct_1", role: "ENGINEERING_LEAD", authorityLevel: 80 },
  ENGINEER: { userId: "user_eng", accountId: "acct_1", role: "ENGINEER", authorityLevel: 40 }
} as const;

const MEMBERS: Record<string, string> = {
  user_owner: "OWNER",
  user_lead: "ENGINEERING_LEAD",
  user_lead2: "ENGINEERING_LEAD",
  user_eng: "ENGINEER"
};

function jsonRequest(method: string, path: string, body: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body)
  });
}

function actAs(actor: (typeof ACTORS)[keyof typeof ACTORS]) {
  mocks.requireDeveloperApi.mockResolvedValue({
    error: null,
    user: { userId: actor.userId },
    activeAccountId: actor.accountId
  });
  mocks.getWorkspaceActor.mockResolvedValue({ ...actor });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMembershipByAccountAndUser.mockImplementation(async (_accountId: string, userId: string) =>
    MEMBERS[userId] ? { membershipId: `mbr_${userId}`, userId, role: MEMBERS[userId] } : null
  );
  mocks.upsertIdentityMapping.mockImplementation(
    async (bindingId: string, accountId: string, externalUserId: string, userId: string) => ({
      bindingId,
      accountId,
      identityMap: [{ externalUserId, userId }]
    })
  );
  mocks.createSlackBinding.mockImplementation(async (input: Record<string, unknown>) => ({
    bindingId: "ibind_1",
    provider: "slack",
    status: "active",
    ...input
  }));
  mocks.findPolicyByAccountId.mockResolvedValue(null);
  mocks.upsertPolicyDocument.mockImplementation(async (doc: unknown) => doc);
});

describe("Slack identity mapping authorization", () => {
  it("blocks an ENGINEER from mapping a Slack user to the workspace owner", async () => {
    actAs(ACTORS.ENGINEER);
    const { PATCH } = await import("@/app/api/dashboard/integrations/slack/route");
    const res = await PATCH(
      jsonRequest("PATCH", "/api/dashboard/integrations/slack", {
        bindingId: "ibind_1",
        externalUserId: "U_ATTACKER",
        userId: "user_owner"
      })
    );
    expect(res.status).toBe(403);
    expect(mocks.upsertIdentityMapping).not.toHaveBeenCalled();
  });

  it("blocks an ENGINEER from creating a binding with a planted owner mapping", async () => {
    actAs(ACTORS.ENGINEER);
    const { POST } = await import("@/app/api/dashboard/integrations/slack/route");
    const res = await POST(
      jsonRequest("POST", "/api/dashboard/integrations/slack", {
        teamId: "T1",
        channelId: "C1",
        botToken: "xoxb-test",
        signingSecret: "attacker-controlled",
        identityMap: [{ externalUserId: "U_ATTACKER", userId: "user_owner" }]
      })
    );
    expect(res.status).toBe(403);
    expect(mocks.createSlackBinding).not.toHaveBeenCalled();
  });

  it("blocks a lead from mapping to the owner, a peer lead, or a non-member", async () => {
    actAs(ACTORS.LEAD);
    const { PATCH } = await import("@/app/api/dashboard/integrations/slack/route");
    for (const userId of ["user_owner", "user_lead2", "user_outsider"]) {
      const res = await PATCH(
        jsonRequest("PATCH", "/api/dashboard/integrations/slack", {
          bindingId: "ibind_1",
          externalUserId: "U_LEAD",
          userId
        })
      );
      expect(res.status).toBe(403);
    }
    expect(mocks.upsertIdentityMapping).not.toHaveBeenCalled();
  });

  it("lets a lead map themselves or a lower-authority member", async () => {
    actAs(ACTORS.LEAD);
    const { PATCH } = await import("@/app/api/dashboard/integrations/slack/route");
    for (const userId of ["user_lead", "user_eng"]) {
      const res = await PATCH(
        jsonRequest("PATCH", "/api/dashboard/integrations/slack", {
          bindingId: "ibind_1",
          externalUserId: `U_${userId}`,
          userId
        })
      );
      expect(res.status).toBe(200);
    }
    expect(mocks.upsertIdentityMapping).toHaveBeenCalledTimes(2);
  });

  it("lets the owner map any current member", async () => {
    actAs(ACTORS.OWNER);
    const { PATCH } = await import("@/app/api/dashboard/integrations/slack/route");
    const res = await PATCH(
      jsonRequest("PATCH", "/api/dashboard/integrations/slack", {
        bindingId: "ibind_1",
        externalUserId: "U_LEAD",
        userId: "user_lead"
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("Guardrail policy authorization", () => {
  const bypassRules = [
    { id: "r1", priority: 1, reason: "skip", when: [{ type: "permission_requires_approval", value: true }], then: "auto_approve" }
  ];
  const denyRules = [{ id: "r1", priority: 1, reason: "block", when: [{ type: "vendor", vendor: "evil.example" }], then: "deny" }];

  it("blocks an ENGINEER from writing or deleting the workspace policy", async () => {
    actAs(ACTORS.ENGINEER);
    const { PUT, DELETE } = await import("@/app/api/dashboard/policies/route");
    const put = await PUT(jsonRequest("PUT", "/api/dashboard/policies", { rules: bypassRules }));
    expect(put.status).toBe(403);
    const del = await DELETE(new NextRequest("http://localhost:3000/api/dashboard/policies", { method: "DELETE" }));
    expect(del.status).toBe(403);
    expect(mocks.upsertPolicyDocument).not.toHaveBeenCalled();
    expect(mocks.deletePolicyDocument).not.toHaveBeenCalled();
  });

  it("blocks a lead from adding auto_approve/allow rules but allows deny rules", async () => {
    actAs(ACTORS.LEAD);
    const { PUT } = await import("@/app/api/dashboard/policies/route");
    const bypass = await PUT(jsonRequest("PUT", "/api/dashboard/policies", { rules: bypassRules }));
    expect(bypass.status).toBe(403);
    expect(mocks.upsertPolicyDocument).not.toHaveBeenCalled();

    const deny = await PUT(jsonRequest("PUT", "/api/dashboard/policies", { rules: denyRules }));
    expect(deny.status).toBe(200);
    expect(mocks.upsertPolicyDocument).toHaveBeenCalledOnce();
  });

  it("lets the owner add auto_approve rules", async () => {
    actAs(ACTORS.OWNER);
    const { PUT } = await import("@/app/api/dashboard/policies/route");
    const res = await PUT(jsonRequest("PUT", "/api/dashboard/policies", { rules: bypassRules }));
    expect(res.status).toBe(200);
  });
});
