import { describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/developerAuth";
import { shouldForceAccountSetupFromContext } from "@/lib/onboardingRedirect";
import Account from "@/models/Account";
import AccountInvite from "@/models/AccountInvite";
import AccountMembership from "@/models/AccountMembership";
import Agent from "@/models/Agent";
import ApprovalRequest from "@/models/ApprovalRequest";
import DeveloperUser from "@/models/DeveloperUser";
import Permission from "@/models/Permission";
import VerificationLog from "@/models/VerificationLog";
import { createPublicId } from "@/lib/ids";
import { hashApiKey } from "@/lib/auth";
import {
  DEFAULT_INTERNAL_DEMO_EMAIL,
  runInternalDemoAccountReset
} from "@/scripts/dev/reset-internal-demo-account-helpers";

const DEMO_PASSWORD =
  "K8#mQ2vR9pL4nX7wZ1cF6hJ0sD5gB3tY8uA2eP7iO1qW4rE9yU6iM3nV0xC7zA1bN";

const RESET_ENV = {
  NODE_ENV: "test",
  INTERNAL_DEMO_PASSWORD: DEMO_PASSWORD
} as const;

async function seedCompletedDemoUser() {
  await runInternalDemoAccountReset({
    env: RESET_ENV,
    hashPassword
  });

  await DeveloperUser.updateOne(
    { email: DEFAULT_INTERNAL_DEMO_EMAIL },
    {
      $set: {
        onboardingCompletedAt: new Date(),
        firstName: "Demo",
        lastName: "User"
      }
    }
  );
}

async function seedDemoActivity() {
  await runInternalDemoAccountReset({
    env: RESET_ENV,
    hashPassword
  });

  const user = await DeveloperUser.findOne({ email: DEFAULT_INTERNAL_DEMO_EMAIL }).lean();
  expect(user?.primaryAccountId).toBeTruthy();

  const agent = await Agent.create({
    agentId: createPublicId("agent"),
    accountId: user!.primaryAccountId!,
    developerUserId: user!.userId,
    name: "Internal Demo Agent",
    apiKeyHash: hashApiKey("bhf_sk_demo_agent_key_abcdefghijklmnopqrstuvwxyz123456")
  });

  await Permission.create({
    permissionId: createPublicId("perm"),
    accountId: user!.primaryAccountId!,
    developerUserId: user!.userId,
    agentId: agent.agentId,
    action: "deploy",
    status: "active"
  });

  await VerificationLog.create({
    logId: createPublicId("log"),
    requestId: createPublicId("req"),
    accountId: user!.primaryAccountId!,
    developerUserId: user!.userId,
    agentId: agent.agentId,
    action: "deploy",
    allowed: true,
    reason: "allowed",
    risk: "low"
  });

  await ApprovalRequest.create({
    approvalId: createPublicId("appr"),
    requestId: createPublicId("req"),
    accountId: user!.primaryAccountId!,
    developerUserId: user!.userId,
    agentId: agent.agentId,
    permissionId: createPublicId("perm"),
    action: "deploy",
    status: "pending"
  });

  await AccountInvite.create({
    inviteId: createPublicId("inv"),
    accountId: user!.primaryAccountId!,
    email: "teammate@behalfid.internal", // pragma: allowlist secret
    role: "ENGINEER",
    invitedBy: user!.userId
  });

  return user!;
}

describe("internal demo account reset integration", () => {
  it("creates/updates demo user with emailVerified true", async () => {
    const result = await runInternalDemoAccountReset({
      env: RESET_ENV,
      hashPassword
    });

    expect(result.email).toBe(DEFAULT_INTERNAL_DEMO_EMAIL);
    expect(result.userAction).toBe("created");

    const user = await DeveloperUser.findOne({ email: DEFAULT_INTERNAL_DEMO_EMAIL })
      .select("+passwordHash +dateOfBirth")
      .lean();

    expect(user?.emailVerified).toBe(true);
    expect(user?.dateOfBirth).toBeTruthy();
    expect(user?.passwordHash).toBeTruthy();
  });

  it("clears onboardingCompletedAt on reset and creates OWNER membership", async () => {
    await seedCompletedDemoUser();

    const before = await DeveloperUser.findOne({ email: DEFAULT_INTERNAL_DEMO_EMAIL }).lean();
    expect(before?.onboardingCompletedAt).toBeTruthy();

    const result = await runInternalDemoAccountReset({
      env: RESET_ENV,
      hashPassword
    });

    expect(result.userAction).toBe("updated");
    expect(result.onboardingReset).toBe(true);
    expect(result.demoDataCleared).toBe(true);
    expect(result.membershipAction).toMatch(/created|existing/);

    const user = await DeveloperUser.findOne({ email: DEFAULT_INTERNAL_DEMO_EMAIL }).lean();
    expect(user?.onboardingCompletedAt).toBeNull();
    expect(user?.firstName).toBeNull();
    expect(user?.lastName).toBeNull();

    const membership = await AccountMembership.findOne({
      userId: user?.userId,
      accountId: user?.primaryAccountId
    }).lean();

    expect(membership?.role).toBe("OWNER");

    const account = await Account.findOne({ accountId: user?.primaryAccountId }).lean();
    expect(account).toBeTruthy();
    expect(account?.onboarding).toBeUndefined();
    expect(account?.verificationCount).toBe(0);
  });

  it("default reset clears demo activity and leaves onboarding-eligible clean state", async () => {
    const user = await seedDemoActivity();
    const otherAccountId = createPublicId("acct");
    await Account.create({ accountId: otherAccountId, name: "Other Account" });
    await Agent.create({
      agentId: createPublicId("agent"),
      accountId: otherAccountId,
      developerUserId: createPublicId("user"),
      name: "Unrelated Agent",
      apiKeyHash: hashApiKey("bhf_sk_other_agent_key_abcdefghijklmnopqrstuvwxyz123456")
    });

    const result = await runInternalDemoAccountReset({
      env: RESET_ENV,
      hashPassword
    });

    expect(result.demoDataCleared).toBe(true);
    expect(result.demoDataPreserved).toBe(false);
    expect(await Agent.countDocuments({ accountId: user.primaryAccountId! })).toBe(0);
    expect(await Permission.countDocuments({ accountId: user.primaryAccountId! })).toBe(0);
    expect(await VerificationLog.countDocuments({ accountId: user.primaryAccountId! })).toBe(0);
    expect(await ApprovalRequest.countDocuments({ accountId: user.primaryAccountId! })).toBe(0);
    expect(await AccountInvite.countDocuments({ accountId: user.primaryAccountId! })).toBe(0);
    expect(await Agent.countDocuments({ accountId: otherAccountId })).toBe(1);

    const resetUser = await DeveloperUser.findOne({ email: DEFAULT_INTERNAL_DEMO_EMAIL }).lean();
    expect(
      shouldForceAccountSetupFromContext({
        onboardingCompletedAt: resetUser?.onboardingCompletedAt,
        createdAt: resetUser?.createdAt,
        agentCount: 0,
        verificationCount: 0
      })
    ).toBe(true);
  });

  it("KEEP_INTERNAL_DEMO_DATA=1 preserves demo activity", async () => {
    const user = await seedDemoActivity();

    const result = await runInternalDemoAccountReset({
      env: {
        ...RESET_ENV,
        KEEP_INTERNAL_DEMO_DATA: "1"
      },
      hashPassword
    });

    expect(result.demoDataCleared).toBe(false);
    expect(result.demoDataPreserved).toBe(true);
    expect(await Agent.countDocuments({ accountId: user.primaryAccountId! })).toBe(1);
    expect(await Permission.countDocuments({ accountId: user.primaryAccountId! })).toBe(1);
    expect(await VerificationLog.countDocuments({ accountId: user.primaryAccountId! })).toBe(1);
    expect(await ApprovalRequest.countDocuments({ accountId: user.primaryAccountId! })).toBe(1);
    expect(await AccountInvite.countDocuments({ accountId: user.primaryAccountId! })).toBe(1);

    const resetUser = await DeveloperUser.findOne({ email: DEFAULT_INTERNAL_DEMO_EMAIL }).lean();
    expect(resetUser?.onboardingCompletedAt).toBeNull();
    expect(
      shouldForceAccountSetupFromContext({
        onboardingCompletedAt: resetUser?.onboardingCompletedAt,
        createdAt: resetUser?.createdAt,
        agentCount: 1,
        verificationCount: 0
      })
    ).toBe(false);
  });
});
