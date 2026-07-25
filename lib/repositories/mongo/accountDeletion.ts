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

export async function findDeveloperUserForDeletion(userId: string) {
  return DeveloperUser.findOne({ userId }).lean();
}

export async function findMembershipsForDeletion(userId: string) {
  return AccountMembership.find({ userId }).lean();
}

export async function countOtherMemberships(accountId: string, userId: string) {
  return AccountMembership.countDocuments({ accountId, userId: { $ne: userId } });
}

export async function deleteMembershipForDeletion(membershipId: string) {
  return AccountMembership.deleteOne({ membershipId });
}

export async function deleteAccountCascade(accountId: string, userId: string) {
  const agents = await Agent.find({ accountId }).select("agentId").lean();
  const agentIds = agents.map((agent) => agent.agentId);
  const sites = await Site.find({ accountId }).select("siteId").lean();
  const siteIds = sites.map((site) => site.siteId);

  await VerificationLog.deleteMany({
    $or: [{ accountId }, { developerUserId: userId }, ...(agentIds.length ? [{ agentId: { $in: agentIds } }] : [])]
  });
  await ApprovalRequest.deleteMany({
    $or: [{ accountId }, { developerUserId: userId }, ...(agentIds.length ? [{ agentId: { $in: agentIds } }] : [])]
  });
  await Permission.deleteMany(agentIds.length ? { $or: [{ accountId }, { agentId: { $in: agentIds } }] } : { accountId });
  await Agent.deleteMany({ accountId });
  await AccountInvite.deleteMany({ accountId });
  await DeveloperApiToken.deleteMany({ $or: [{ accountId }, { userId }] });

  if (siteIds.length) {
    await SiteAccessLog.deleteMany({ siteId: { $in: siteIds } });
    await SiteAccessRule.deleteMany({ siteId: { $in: siteIds } });
    await SiteGuardKey.deleteMany({ siteId: { $in: siteIds } });
  }
  await Site.deleteMany({ accountId });

  const endpoints = await WebhookEndpoint.find({ accountId }).select("webhookId").lean();
  const webhookIds = endpoints.map((endpoint) => endpoint.webhookId);
  const events = await WebhookEvent.find({ accountId }).select("eventId").lean();
  const eventIds = events.map((event) => event.eventId);
  await WebhookDelivery.deleteMany({
    $or: [
      { accountId },
      ...(webhookIds.length ? [{ webhookId: { $in: webhookIds } }] : []),
      ...(eventIds.length ? [{ eventId: { $in: eventIds } }] : [])
    ]
  });
  await WebhookEvent.deleteMany({ accountId });
  await WebhookEndpoint.deleteMany({ accountId });
  await AccountMembership.deleteMany({ accountId });
  await Account.deleteOne({ accountId });
}

export async function deleteDeveloperUserCredentials(userId: string) {
  await DeveloperSession.deleteMany({ userId });
  await DeveloperApiToken.deleteMany({ userId });
  return DeveloperUser.deleteOne({ userId });
}
