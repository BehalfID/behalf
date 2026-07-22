import type { PolicyDocument } from "@/lib/policyEngine/types";
import {
  findActivePolicyByAccountId,
  toEnginePolicyDocument
} from "@/lib/repositories/policyDocuments";

type CacheEntry = {
  expiresAt: number;
  value: PolicyDocument | null;
};

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, CacheEntry>();

/** Test helper — clears the in-process policy cache. */
export function clearPolicyDocumentCache() {
  cache.clear();
}

export function invalidatePolicyDocumentCache(accountId: string) {
  cache.delete(accountId);
}

/**
 * Load the account's active guardrail PolicyDocument.
 * Uses a short in-process TTL cache for hot verify paths.
 */
export async function loadPolicyDocument(
  accountId: string | undefined | null
): Promise<PolicyDocument | null> {
  if (!accountId) return null;

  const cached = cache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const doc = await findActivePolicyByAccountId(accountId);
  const value = doc ? toEnginePolicyDocument(doc) : null;
  // Disabled or empty-rule docs still load as PolicyDocument; verify treats
  // !enabled || rules.length===0 as a no-op. Active-only query already filters enabled.
  if (value && (!value.enabled || value.rules.length === 0)) {
    cache.set(accountId, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }

  cache.set(accountId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
