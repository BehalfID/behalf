/**
 * The resolved workspace actor is the authorization result, and everything
 * workspace-scoped after it must use that account id.
 *
 * `requireWorkspaceMutationActor` resolves `activeAccountId ?? primaryAccountId`,
 * so `auth.activeAccountId` is legitimately null for a caller who still has a
 * valid workspace. Reading it again after authorization meant:
 *   - `checkAgentLimit(null)` evaluated quota without an account
 *   - `createDeveloperAgent(userId, undefined, …)` wrote an unscoped,
 *     legacy-style row with no accountId
 *   - the `agent.created` event was scoped to nothing and dropped
 *
 * `requireWorkspaceMutationActor` is deliberately NOT mocked here — the real
 * resolution is the thing under test. Only the workspace lookup it calls is
 * stubbed, so `?? primaryAccountId` runs for real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const PLAINTEXT = "bk_live_resolution_key_do_not_log";

const ACTIVE_ACCOUNT = "acct_active";
const PRIMARY_ACCOUNT = "acct_primary";
const OTHER_ACCOUNT = "acct_someone_else";

const mocks = vi.hoisted(() => ({
  requireVerifiedDeveloperApi: vi.fn(),
  getWorkspaceActor: vi.fn(),
  checkAgentLimit: vi.fn(),
  createAgent: vi.fn(),
  createEvent: vi.fn(),
  createPermissionForAgent: vi.fn(),
  deleteAgent: vi.fn(),
  deletePermissions: vi.fn()
}));

vi.mock("@/lib/developerAuth", () => ({
  requireVerifiedDeveloperApi: mocks.requireVerifiedDeveloperApi,
  requireDeveloperApi: vi.fn()
}));
// Only the workspace lookup is stubbed; canManageAgents and
// requireWorkspaceMutationActor stay real.
vi.mock("@/lib/delegatedAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/delegatedAuth")>()),
  getWorkspaceActor: mocks.getWorkspaceActor
}));
vi.mock("@/lib/quota", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/quota")>()),
  checkAgentLimit: mocks.checkAgentLimit
}));
vi.mock("@/lib/repositories/agents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/agents")>()),
  createAgent: mocks.createAgent,
  deleteAgent: mocks.deleteAgent
}));
vi.mock("@/lib/repositories/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/permissions")>()),
  deletePermissions: mocks.deletePermissions
}));
vi.mock("@/lib/repositories/webhooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/webhooks")>()),
  createEvent: mocks.createEvent
}));
vi.mock("@/lib/permissionMutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissionMutations")>()),
  createPermissionForAgent: mocks.createPermissionForAgent
}));
vi.mock("@/lib/ids", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ids")>()),
  createApiKey: () => PLAINTEXT
}));

import { POST as createAgentRoute } from "@/app/api/dashboard/agents/route";
import { POST as firstSetupRoute } from "@/app/api/dashboard/agents/first-setup/route";

/** Workspaces this user is genuinely a member of. */
const MEMBER_OF = new Set([ACTIVE_ACCOUNT, PRIMARY_ACCOUNT]);

function actorFor(accountId: string) {
  return { userId: "user_1", accountId, role: "OWNER", authorityLevel: 100 };
}

function makeRequest(body: unknown, path = "/api/dashboard/agents") {
  const url = `https://app.behalfid.com${path}`;
  const request = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  Object.defineProperty(request, "nextUrl", { value: new URL(url) });
  return request as never;
}

const SETUP_BODY = {
  surface: "claude_code",
  name: "First agent",
  // Omitted protectionPolicy falls back to the recommended policy server-side.
};

/** `activeAccountId` is what the session carries; may legitimately be null. */
function signedInWith(activeAccountId: string | null) {
  mocks.requireVerifiedDeveloperApi.mockResolvedValue({
    error: null,
    user: { userId: "user_1", primaryAccountId: PRIMARY_ACCOUNT },
    activeAccountId
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // The real workspace store: membership decides, nothing falls back silently.
  mocks.getWorkspaceActor.mockImplementation(async (_userId: string, accountId?: string | null) =>
    accountId && MEMBER_OF.has(accountId) ? actorFor(accountId) : null
  );
  mocks.checkAgentLimit.mockResolvedValue({ allowed: true });
  mocks.createAgent.mockImplementation(async (doc: Record<string, unknown>) => ({ ...doc }));
  mocks.createEvent.mockResolvedValue({});
  mocks.createPermissionForAgent.mockResolvedValue({ permissionId: "perm_1" });
});

describe("POST /api/dashboard/agents — active workspace present", () => {
  beforeEach(() => signedInWith(ACTIVE_ACCOUNT));

  it("returns 201 with the plaintext key exactly once", async () => {
    const res = await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.apiKey).toBe(PLAINTEXT);
    expect(JSON.stringify(body).match(new RegExp(PLAINTEXT, "g"))).toHaveLength(1);
  });

  it("evaluates quota against the actor's account", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(mocks.checkAgentLimit).toHaveBeenCalledWith(ACTIVE_ACCOUNT);
  });

  it("scopes the agent row and the event to the actor's account", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(mocks.createAgent.mock.calls[0][0].accountId).toBe(ACTIVE_ACCOUNT);
    expect(mocks.createEvent.mock.calls[0][0].accountId).toBe(ACTIVE_ACCOUNT);
  });
});

describe("POST /api/dashboard/agents — no active workspace, valid primary", () => {
  // The regression: a null activeAccountId with a valid primaryAccountId.
  beforeEach(() => signedInWith(null));

  it("resolves the actor from primaryAccountId and returns 201, not 402 or 500", async () => {
    const res = await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(res.status).toBe(201);
    expect((await res.json()).apiKey).toBe(PLAINTEXT);
  });

  it("evaluates quota against the primary workspace, not a missing account", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(mocks.checkAgentLimit).toHaveBeenCalledWith(PRIMARY_ACCOUNT);
    expect(mocks.checkAgentLimit).not.toHaveBeenCalledWith(null);
    expect(mocks.checkAgentLimit).not.toHaveBeenCalledWith(undefined);
  });

  it("scopes the agent to the primary workspace instead of writing a legacy row", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    const persisted = mocks.createAgent.mock.calls[0][0];
    expect(persisted.accountId).toBe(PRIMARY_ACCOUNT);
    // An unscoped row is exactly what the old `?? undefined` produced.
    expect(persisted.accountId).toBeDefined();
  });

  it("emits the event against the primary workspace instead of dropping it", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(mocks.createEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createEvent.mock.calls[0][0].accountId).toBe(PRIMARY_ACCOUNT);
  });

  it("persists the agent and the event against the identical account id", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(mocks.createAgent.mock.calls[0][0].accountId).toBe(
      mocks.createEvent.mock.calls[0][0].accountId
    );
  });
});

describe("POST /api/dashboard/agents — stale explicit workspace", () => {
  // Explicitly selected but no longer a membership. `??` does not apply, so
  // there must be no silent fallback to the primary workspace.
  beforeEach(() => signedInWith(OTHER_ACCOUNT));

  it("fails authorization in a controlled way", async () => {
    const res = await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(res.status).toBe(403);
    expect(await res.text()).not.toBe("");
  });

  it("does not fall back to another workspace", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(mocks.getWorkspaceActor).toHaveBeenCalledWith("user_1", OTHER_ACCOUNT);
    expect(mocks.checkAgentLimit).not.toHaveBeenCalled();
  });

  it("creates no agent and no event", async () => {
    await createAgentRoute(makeRequest({ name: "Deploy bot" }));
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });
});

describe("POST /api/dashboard/agents/first-setup — active workspace present", () => {
  beforeEach(() => signedInWith(ACTIVE_ACCOUNT));

  it("returns 201 with the token once and scopes everything to the actor", async () => {
    const res = await firstSetupRoute(
      makeRequest(SETUP_BODY, "/api/dashboard/agents/first-setup")
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.apiKey).toBe(PLAINTEXT);
    expect(JSON.stringify(body).match(new RegExp(PLAINTEXT, "g"))).toHaveLength(1);
    expect(mocks.checkAgentLimit).toHaveBeenCalledWith(ACTIVE_ACCOUNT);
    expect(mocks.createAgent.mock.calls[0][0].accountId).toBe(ACTIVE_ACCOUNT);
    expect(mocks.createEvent.mock.calls[0][0].accountId).toBe(ACTIVE_ACCOUNT);
  });
});

describe("POST /api/dashboard/agents/first-setup — no active workspace, valid primary", () => {
  beforeEach(() => signedInWith(null));

  it("returns 201, not 402 or 500", async () => {
    const res = await firstSetupRoute(
      makeRequest(SETUP_BODY, "/api/dashboard/agents/first-setup")
    );
    expect(res.status).toBe(201);
    expect((await res.json()).apiKey).toBe(PLAINTEXT);
  });

  it("uses the primary workspace for quota, the agent row and the event", async () => {
    await firstSetupRoute(makeRequest(SETUP_BODY, "/api/dashboard/agents/first-setup"));
    expect(mocks.checkAgentLimit).toHaveBeenCalledWith(PRIMARY_ACCOUNT);
    expect(mocks.createAgent.mock.calls[0][0].accountId).toBe(PRIMARY_ACCOUNT);
    // Previously `createWebhookEvent(auth.activeAccountId ?? null, …)` returned
    // null here, so a valid workspace silently lost its agent.created event.
    expect(mocks.createEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createEvent.mock.calls[0][0].accountId).toBe(PRIMARY_ACCOUNT);
  });

  it("creates the requested permissions against the resolved actor", async () => {
    await firstSetupRoute(makeRequest(SETUP_BODY, "/api/dashboard/agents/first-setup"));
    expect(mocks.createPermissionForAgent).toHaveBeenCalled();
    for (const [call] of mocks.createPermissionForAgent.mock.calls) {
      expect(call.actor.accountId).toBe(PRIMARY_ACCOUNT);
    }
  });

  it("rolls back against the resolved workspace when a permission fails", async () => {
    mocks.createPermissionForAgent.mockResolvedValue({ error: "nope" });
    mocks.deleteAgent.mockResolvedValue({ deletedCount: 1 });
    mocks.deletePermissions.mockResolvedValue({ deletedCount: 0 });

    const res = await firstSetupRoute(
      makeRequest(SETUP_BODY, "/api/dashboard/agents/first-setup")
    );

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("SETUP_FAILED");
    // The rollback filter must name the resolved workspace, never null.
    const [filter] = mocks.deleteAgent.mock.calls[0];
    expect(JSON.stringify(filter)).toContain(PRIMARY_ACCOUNT);
  });
});

describe("first-setup — stale explicit workspace", () => {
  beforeEach(() => signedInWith(OTHER_ACCOUNT));

  it("refuses without creating an agent or event", async () => {
    const res = await firstSetupRoute(
      makeRequest(SETUP_BODY, "/api/dashboard/agents/first-setup")
    );
    expect(res.status).toBe(403);
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });
});
