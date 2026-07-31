import Site, { type SiteDocument } from "@/models/Site";
import SiteAccessLog, { type SiteAccessLogDocument } from "@/models/SiteAccessLog";
import SiteAccessRule, { type SiteAccessRuleDocument } from "@/models/SiteAccessRule";
import SiteGuardKey, { type SiteGuardKeyDocument } from "@/models/SiteGuardKey";
import { lazyModelAdapter } from "@/lib/repositories/mongoModelAdapter";
import { translateDuplicateKey } from "@/lib/repositories/errors";

export type SiteLean = SiteDocument;
export type SiteAccessRuleLean = SiteAccessRuleDocument;
export type SiteAccessLogLean = SiteAccessLogDocument;
export type SiteGuardKeyLean = SiteGuardKeyDocument;

export async function findSite(filter: {
  accountId: string;
  developerUserId?: string;
  siteId?: string;
  domain?: string | null;
}): Promise<SiteLean | null> {
  return Site.findOne(filter).lean();
}

export async function createSite(input: {
  siteId: string;
  accountId: string;
  developerUserId: string;
  name: string;
  domain: string;
  status?: "active" | "disabled";
}) {
  try {
    return await Site.create(input);
  } catch (error) {
    translateDuplicateKey(error, "A site with this domain already exists in this workspace.");
  }
}

export async function updateSite(
  siteId: string,
  accountId: string,
  update: Partial<Pick<SiteDocument, "name" | "domain" | "status">>
) {
  try {
    return await Site.findOneAndUpdate({ siteId, accountId }, { $set: update }, { new: true }).lean();
  } catch (error) {
    translateDuplicateKey(error, "A site with this domain already exists in this workspace.");
  }
}

export async function listSites(accountId: string, developerUserId?: string): Promise<SiteLean[]> {
  return Site.find({ accountId, ...(developerUserId ? { developerUserId } : {}) })
    .sort({ createdAt: -1 })
    .lean();
}

export async function createRule(input: Omit<SiteAccessRuleDocument, "_id" | "createdAt" | "updatedAt">) {
  try {
    return await SiteAccessRule.create(input);
  } catch (error) {
    translateDuplicateKey(error, "A Site Guard rule with this ID already exists.");
  }
}

export async function updateRule(
  ruleId: string,
  accountId: string,
  update: Partial<
    Pick<
      SiteAccessRuleDocument,
      | "name"
      | "status"
      | "agentIdentifier"
      | "userAgentPattern"
      | "allowedPaths"
      | "blockedPaths"
      | "requiresApproval"
      | "notes"
    >
  >
) {
  return SiteAccessRule.findOneAndUpdate({ ruleId, accountId }, { $set: update }, { new: true }).lean();
}

export async function deleteRule(ruleId: string, accountId: string) {
  return SiteAccessRule.deleteOne({ ruleId, accountId });
}

export async function findRulesBySite(
  siteId: string,
  filter?: { accountId?: string; developerUserId?: string }
): Promise<SiteAccessRuleLean[]> {
  return SiteAccessRule.find({ siteId, ...filter }).sort({ createdAt: -1 }).lean();
}

export async function createAccessLog(input: Omit<SiteAccessLogDocument, "_id" | "createdAt" | "updatedAt">) {
  try {
    return await SiteAccessLog.create(input);
  } catch (error) {
    translateDuplicateKey(error, "A Site Guard access log with this request ID already exists.");
  }
}

export async function listAccessLogs(
  accountId: string,
  options?: { siteId?: string; developerUserId?: string; limit?: number }
): Promise<SiteAccessLogLean[]> {
  return SiteAccessLog.find({
    accountId,
    ...(options?.siteId ? { siteId: options.siteId } : {}),
    ...(options?.developerUserId ? { developerUserId: options.developerUserId } : {})
  })
    .sort({ createdAt: -1 })
    .limit(options?.limit ?? 100)
    .lean();
}

export async function deleteAccessLogs(filter: Record<string, unknown>) {
  return SiteAccessLog.deleteMany(filter);
}

export async function findKeyByHash(keyHash: string): Promise<SiteGuardKeyLean | null> {
  return SiteGuardKey.findOne({ keyHash }).select("+keyHash").lean();
}

export async function createKey(input: Omit<SiteGuardKeyDocument, "_id" | "createdAt" | "updatedAt">) {
  try {
    return await SiteGuardKey.create(input);
  } catch (error) {
    translateDuplicateKey(error, "A Site Guard key with this ID already exists.");
  }
}

export async function revokeKey(keyId: string, accountId: string) {
  return SiteGuardKey.updateOne({ keyId, accountId }, { $set: { status: "revoked" } });
}

export async function listKeys(
  accountId: string,
  options?: { siteId?: string; developerUserId?: string }
): Promise<SiteGuardKeyLean[]> {
  return SiteGuardKey.find({
    accountId,
    ...(options?.siteId ? { siteId: options.siteId } : {}),
    ...(options?.developerUserId ? { developerUserId: options.developerUserId } : {})
  })
    .sort({ createdAt: -1 })
    .lean();
}

export async function touchLastUsed(keyId: string, usedAt = new Date()) {
  return SiteGuardKey.updateOne({ keyId }, { $set: { lastUsedAt: usedAt } });
}

type SiteQueryOptions = {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  select?: string;
};

/** Mongo query primitives for routes that need an exact model query shape. */
export function findSites(filter: Record<string, unknown> = {}, options: SiteQueryOptions = {}) {
  const query = Site.find(filter);
  if (options.sort) query.sort(options.sort);
  if (options.select) query.select(options.select);
  if (options.skip) query.skip(options.skip);
  if (options.limit) query.limit(options.limit);
  return query.lean();
}

export function createSiteDocument(input: Record<string, unknown>) {
  return Site.create(input);
}

export function findOneSite(filter: Record<string, unknown>, options: SiteQueryOptions = {}) {
  const query = Site.findOne(filter);
  if (options.select) query.select(options.select);
  return query.lean();
}

export function findOneAndUpdateSite(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options?: Record<string, unknown>
) {
  return Site.findOneAndUpdate(filter, update, options);
}

export function findRules(filter: Record<string, unknown> = {}, options: SiteQueryOptions = {}) {
  const query = SiteAccessRule.find(filter);
  if (options.sort) query.sort(options.sort);
  if (options.select) query.select(options.select);
  if (options.skip) query.skip(options.skip);
  if (options.limit) query.limit(options.limit);
  return query.lean();
}

export function createRuleDocument(input: Record<string, unknown>) {
  return SiteAccessRule.create(input);
}

export function findOneRule(filter: Record<string, unknown>, options: SiteQueryOptions = {}) {
  const query = SiteAccessRule.findOne(filter);
  if (options.select) query.select(options.select);
  return query.lean();
}

export function findOneAndUpdateRule(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options?: Record<string, unknown>
) {
  return SiteAccessRule.findOneAndUpdate(filter, update, options);
}

export function findAccessLogs(filter: Record<string, unknown> = {}, options: SiteQueryOptions = {}) {
  const query = SiteAccessLog.find(filter);
  if (options.sort) query.sort(options.sort);
  if (options.select) query.select(options.select);
  if (options.skip) query.skip(options.skip);
  if (options.limit) query.limit(options.limit);
  return query.lean();
}

export function findKeys(filter: Record<string, unknown> = {}, options: SiteQueryOptions = {}) {
  const query = SiteGuardKey.find(filter);
  if (options.sort) query.sort(options.sort);
  if (options.select) query.select(options.select);
  if (options.skip) query.skip(options.skip);
  if (options.limit) query.limit(options.limit);
  return query.lean();
}

export function createKeyDocument(input: Record<string, unknown>) {
  return SiteGuardKey.create(input);
}

export function findOneAndUpdateKey(
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  options?: Record<string, unknown>
) {
  return SiteGuardKey.findOneAndUpdate(filter, update, options);
}

export const siteModel = lazyModelAdapter(() => Site);
export const accessLogModel = lazyModelAdapter(() => SiteAccessLog);
export const accessRuleModel = lazyModelAdapter(() => SiteAccessRule);
export const keyModel = lazyModelAdapter(() => SiteGuardKey);

export const siteRepository = { create: createSiteDocument, find: findSites, findOne: findOneSite, findOneAndUpdate: findOneAndUpdateSite };
export const siteAccessRuleRepository = { create: createRuleDocument, find: findRules, findOne: findOneRule, findOneAndUpdate: findOneAndUpdateRule };
export const siteAccessLogRepository = { find: findAccessLogs };
export const siteGuardKeyRepository = { create: createKeyDocument, find: findKeys, findOneAndUpdate: findOneAndUpdateKey };
