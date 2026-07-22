import { createPublicId } from "@/lib/ids";
import IntegrationBinding, {
  CollaborationMessageRef,
  type CollaborationMessageRefDocument,
  type IntegrationBindingDocument
} from "@/models/IntegrationBinding";

export type IntegrationBindingLean = IntegrationBindingDocument;
export type CollaborationMessageRefLean = CollaborationMessageRefDocument;

export type CreateSlackBindingInput = {
  accountId: string;
  teamId: string;
  teamName?: string;
  channelId: string;
  channelName?: string;
  botToken: string;
  signingSecret: string;
  createdBy: string;
  identityMap?: Array<{ externalUserId: string; userId: string }>;
};

export async function listIntegrationBindings(accountId: string, provider?: "slack") {
  return IntegrationBinding.find({
    accountId,
    ...(provider ? { provider } : {}),
    status: "active"
  })
    .select("-botToken -signingSecret")
    .sort({ createdAt: -1 })
    .lean();
}

export async function findIntegrationBinding(
  bindingId: string,
  accountId: string
): Promise<IntegrationBindingLean | null> {
  return IntegrationBinding.findOne({ bindingId, accountId })
    .select("-botToken -signingSecret")
    .lean();
}

export async function findSlackBindingsWithSecrets(accountId: string) {
  return IntegrationBinding.find({
    accountId,
    provider: "slack",
    status: "active"
  }).select("+botToken +signingSecret");
}

export async function findSlackBindingByTeamWithSecrets(teamId: string) {
  return IntegrationBinding.find({
    provider: "slack",
    status: "active",
    teamId
  }).select("+botToken +signingSecret");
}

export async function createSlackBinding(input: CreateSlackBindingInput) {
  return IntegrationBinding.create({
    bindingId: createPublicId("ibind"),
    accountId: input.accountId,
    provider: "slack",
    status: "active",
    teamId: input.teamId,
    teamName: input.teamName,
    channelId: input.channelId,
    channelName: input.channelName,
    botToken: input.botToken,
    signingSecret: input.signingSecret,
    identityMap: input.identityMap ?? [],
    createdBy: input.createdBy
  });
}

export async function upsertIdentityMapping(
  bindingId: string,
  accountId: string,
  externalUserId: string,
  userId: string
) {
  const binding = await IntegrationBinding.findOne({ bindingId, accountId });
  if (!binding) return null;

  const map = [...(binding.identityMap ?? [])].filter(
    (entry) => entry.externalUserId !== externalUserId
  );
  map.push({ externalUserId, userId });
  binding.identityMap = map;
  await binding.save();
  return binding.toObject();
}

export async function disableIntegrationBinding(bindingId: string, accountId: string) {
  return IntegrationBinding.findOneAndUpdate(
    { bindingId, accountId },
    { $set: { status: "disabled" } },
    { new: true }
  )
    .select("-botToken -signingSecret")
    .lean();
}

export async function findMessageRefByApproval(
  accountId: string,
  approvalId: string,
  provider: "slack" = "slack"
) {
  return CollaborationMessageRef.findOne({ accountId, approvalId, provider }).lean();
}

export async function upsertMessageRef(input: {
  accountId: string;
  bindingId: string;
  approvalId: string;
  channelId: string;
  messageTs: string;
  status: "pending" | "approved" | "denied" | "used";
  provider?: "slack";
}) {
  return CollaborationMessageRef.findOneAndUpdate(
    {
      accountId: input.accountId,
      approvalId: input.approvalId,
      provider: input.provider ?? "slack"
    },
    {
      $set: {
        bindingId: input.bindingId,
        channelId: input.channelId,
        messageTs: input.messageTs,
        status: input.status
      },
      $setOnInsert: {
        refId: createPublicId("omsg"),
        accountId: input.accountId,
        approvalId: input.approvalId,
        provider: input.provider ?? "slack"
      }
    },
    { upsert: true, new: true }
  ).lean();
}

export function resolveUserIdFromBinding(
  binding: Pick<IntegrationBindingLean, "identityMap">,
  externalUserId: string
): string | null {
  const entry = (binding.identityMap ?? []).find(
    (item) => item.externalUserId === externalUserId
  );
  return entry?.userId ?? null;
}
