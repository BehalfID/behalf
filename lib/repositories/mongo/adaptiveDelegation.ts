import AdaptiveDelegationEvent from "@/models/AdaptiveDelegationEvent";
import AdaptiveDelegationRecommendation from "@/models/AdaptiveDelegationRecommendation";

export type AdaptiveDelegationRecommendationLean = Record<string, unknown> & {
  recommendationId: string;
  accountId: string;
  agentId: string;
  fingerprint: string;
  status: string;
  kind?: string;
  action?: string;
  dismissReason?: string | null;
  remindAt?: Date | null;
  acceptedProfileId?: string | null;
  proposedTrustProfile?: { templateId?: string } | null;
  proposedOrgDelegation?: { templateId?: string } | null;
};

export async function createEvent(input: Record<string, unknown>) {
  return AdaptiveDelegationEvent.create(input);
}

export async function findRecommendations(
  filter: Record<string, unknown>,
  options: { select?: string; sort?: Record<string, 1 | -1>; lean?: boolean } = {}
) {
  const query = AdaptiveDelegationRecommendation.find(filter);
  if (options.select) query.select(options.select);
  if (options.sort) query.sort(options.sort);
  return options.lean === false ? query : query.lean();
}

export async function findOneRecommendation(filter: Record<string, unknown>) {
  return AdaptiveDelegationRecommendation.findOne(filter).lean();
}

export async function findOneAndUpdateRecommendation(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options: Record<string, unknown> = {}
) {
  return AdaptiveDelegationRecommendation.findOneAndUpdate(filter, update, options).lean();
}

export async function createRecommendation(input: Record<string, unknown>) {
  const doc = await AdaptiveDelegationRecommendation.create(input);
  return doc.toObject();
}

export async function updateRecommendations(
  filter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return AdaptiveDelegationRecommendation.updateMany(filter, update);
}
