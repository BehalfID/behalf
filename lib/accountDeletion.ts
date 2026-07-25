import { connectToDatabase } from "@/lib/db";
import Account from "@/models/Account";
import AccountInvite from "@/models/AccountInvite";
import AccountMembership from "@/models/AccountMembership";
import Agent from "@/models/Agent";
import ApprovalRequest from "@/models/ApprovalRequest";
import DeveloperApiToken from "@/models/DeveloperApiToken";
import DeveloperSession from "@/models/DeveloperSession";
import DeveloperUser from "@/models/DeveloperUser";
import Permission from "@/models/Permission";
import Site from "@/models/Site";
import SiteAccessLog from "@/models/SiteAccessLog";
import SiteAccessRule from "@/models/SiteAccessRule";
import SiteGuardKey from "@/models/SiteGuardKey";
import VerificationLog from "@/models/VerificationLog";
import WebhookDelivery from "@/models/WebhookDelivery";
import WebhookEndpoint from "@/models/WebhookEndpoint";
import WebhookEvent from "@/models/WebhookEvent";

export type AccountDeletionResult =
  | { ok: true; deletedUserId: string; deletedAccountIds: string[] }
  | { ok: false; error: string; status: number };

async function deleteAccountData(accountId: string, userId: string) {
  const agents = await Agent.find({ accountId }).select("agentId").lean();
  const agentIds = agents.map((agent) => agent.agentId);

  const permissionFilter =
    agentIds.length > 0
      ? { $or: [{ accountId }, { agentId: { $in: agentIds } }] }
      : { accountId };

  const sites = await Site.find({ accountId }).select("siteId").lean();
  const siteIds = sites.map((site) => site.siteId);

  await VerificationLog.deleteMany({
    $or: [{ accountId }, { developerUserId: userId }, ...(agentIds.length ? [{ agentId: { $in: agentIds } }] : [])]
  });
  await ApprovalRequest.deleteMany({
    $or: [{ accountId }, { developerUserId: userId }, ...(agentIds.length ? [{ agentId: { $in: agentIds } }] : [])]
  });
  await Permission.deleteMany(permissionFilter);
  await Agent.deleteMany({ accountId });
  await AccountInvite.deleteMany({ accountId });
  await DeveloperApiToken.deleteMany({ $or: [{ accountId }, { userId }] });

  if (siteIds.length > 0) {
    await SiteAccessLog.deleteMany({ siteId: { $in: siteIds } });
    await SiteAccessRule.deleteMany({ siteId: { $in: siteIds } });
    await SiteGuardKey.deleteMany({ siteId: { $in: siteIds } });
  }
  await Site.deleteMany({ accountId });

  const webhookEndpoints = await WebhookEndpoint.find({ accountId }).select("webhookId").lean();
  const webhookIds = webhookEndpoints.map((endpoint) => endpoint.webhookId);
  const webhookEvents = await WebhookEvent.find({ accountId }).select("eventId").lean();
  const eventIds = webhookEvents.map((event) => event.eventId);

  const deliveryFilters = [
    { accountId },
    ...(webhookIds.length ? [{ webhookId: { $in: webhookIds } }] : []),
    ...(eventIds.length ? [{ eventId: { $in: eventIds } }] : [])
  ];
  if (deliveryFilters.length > 0) {
    await WebhookDelivery.deleteMany({ $or: deliveryFilters });
  }
  await WebhookEvent.deleteMany({ accountId });
  await WebhookEndpoint.deleteMany({ accountId });
  await AccountMembership.deleteMany({ accountId });
  await Account.deleteOne({ accountId });
}

/**
 * Permanently delete a developer user and sole-owned workspace data.
 * Shared workspaces keep the account; only this user's membership is removed.
 */
export async function deleteDeveloperUser(userId: string): Promise<AccountDeletionResult> {
  await connectToDatabase();

  const user = await DeveloperUser.findOne({ userId }).lean();
  if (!user) {
    return { ok: false, error: "Account not found.", status: 404 };
  }

  const memberships = await AccountMembership.find({ userId }).lean();
  const deletedAccountIds: string[] = [];

  for (const membership of memberships) {
    const otherMembers = await AccountMembership.countDocuments({
      accountId: membership.accountId,
      userId: { $ne: userId }
    });

    if (otherMembers > 0) {
      await AccountMembership.deleteOne({ membershipId: membership.membershipId });
      continue;
    }

    await deleteAccountData(membership.accountId, userId);
    deletedAccountIds.push(membership.accountId);
  }

  await DeveloperSession.deleteMany({ userId });
  await DeveloperApiToken.deleteMany({ userId });
  await DeveloperUser.deleteOne({ userId });

  return { ok: true, deletedUserId: userId, deletedAccountIds };
}
