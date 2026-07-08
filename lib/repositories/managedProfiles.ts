import ManagedProfilePolicy from "@/models/ManagedProfilePolicy";

export async function findManagedProfilePolicyByAccountId(accountId: string) {
  return ManagedProfilePolicy.findOne({ accountId }).lean();
}

export async function findManagedProfilePolicyProtectedReposByAccountId(accountId: string) {
  return ManagedProfilePolicy.findOne({ accountId }).select("protectedRepos").lean();
}

export async function countProtectedReposByAccountId(accountId: string) {
  const policy = await findManagedProfilePolicyProtectedReposByAccountId(accountId);
  return policy?.protectedRepos?.length ?? 0;
}

export async function upsertManagedProfilePolicy(
  accountId: string,
  policyId: string,
  policy: Record<string, unknown>
) {
  return ManagedProfilePolicy.findOneAndUpdate(
    { accountId },
    {
      policyId,
      accountId,
      ...policy
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}
