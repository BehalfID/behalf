import { hashApiKey } from "@/lib/auth";
import { verificationPeriodStart, type Plan } from "@/lib/plans";

export const rawApiKey = "bhf_sk_test_abcdefghijklmnopqrstuvwxyz123456";

export function accountFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    accountId: "acct_test",
    name: "Test Account",
    slug: "test-account",
    plan: "free" as Plan,
    verificationCount: 0,
    verificationPeriodStart: verificationPeriodStart(),
    ...overrides
  };
}

export function membershipFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    membershipId: "mbr_test",
    accountId: "acct_test",
    userId: "dev_test",
    role: "OWNER",
    ...overrides
  };
}

export function developerUserFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: "dev_test",
    accountId: "acct_test",
    email: "dev@example.com",
    ...overrides
  };
}

export function agentFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    agentId: "agent_test",
    accountId: "acct_test",
    developerUserId: "dev_test",
    name: "Test Agent",
    status: "active",
    apiKeyHash: hashApiKey(rawApiKey),
    ...overrides
  };
}

export function permissionFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    permissionId: "perm_test",
    agentId: "agent_test",
    accountId: "acct_test",
    developerUserId: "dev_test",
    action: "purchase",
    status: "active",
    allowedActions: undefined,
    blockedActions: undefined,
    requiresApproval: false,
    resource: undefined,
    constraints: {},
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

export function verificationRequestFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    agentId: "agent_test",
    accountId: "acct_test",
    developerUserId: "dev_test",
    agentStatus: "active",
    action: "purchase",
    amount: 25,
    vendor: "amazon.com",
    metadata: { purpose: "test" },
    ...overrides
  };
}

export function webhookEndpointFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    webhookId: "webhook_test",
    accountId: "acct_test",
    developerUserId: "dev_test",
    url: "https://hooks.example.com/behalf",
    secretHash: "secret_hash",
    events: ["verification.allowed", "verification.denied"],
    status: "active",
    ...overrides
  };
}

export function mockAccountPlan(plan: Plan, overrides: Partial<Record<string, unknown>> = {}) {
  return accountFixture({ plan, ...overrides });
}
