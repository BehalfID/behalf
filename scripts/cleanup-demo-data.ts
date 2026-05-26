import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import mongoose from "mongoose";
import { connectToDatabase } from "../lib/db";
import Account from "../models/Account";
import Agent from "../models/Agent";
import DeveloperApiToken from "../models/DeveloperApiToken";
import DeveloperSession from "../models/DeveloperSession";
import DeveloperUser from "../models/DeveloperUser";
import Permission from "../models/Permission";
import Site from "../models/Site";
import SiteAccessLog from "../models/SiteAccessLog";
import SiteAccessRule from "../models/SiteAccessRule";
import SiteGuardKey from "../models/SiteGuardKey";
import StripeWebhookEvent from "../models/StripeWebhookEvent";
import VerificationLog from "../models/VerificationLog";
import WebhookDelivery from "../models/WebhookDelivery";
import WebhookEndpoint from "../models/WebhookEndpoint";
import WebhookEvent from "../models/WebhookEvent";
import {
  CLEANUP_CONFIRMATION,
  DEMO_RULE_AGENT_IDENTIFIERS,
  DEMO_RULE_PATH_PATTERNS,
  DEMO_RULE_USER_AGENT_PATTERNS,
  DEMO_SITE_DOMAINS,
  DEMO_SITE_NAMES,
  getOlderThanDate,
  isDemoAccount,
  isDemoAgent,
  isDemoDeveloperUser,
  isDemoSite,
  isDemoSiteRule,
  isDestructiveModeAllowed,
  parseCleanupArgs,
  type CleanupOptions
} from "./cleanup-demo-data-helpers";

type CleanupDocument = Record<string, unknown> & {
  _id: mongoose.Types.ObjectId;
  accountId?: string;
  agentId?: string;
  agentIdentifier?: string;
  allowedPaths?: string[];
  blockedPaths?: string[];
  createdAt?: Date;
  developerUserId?: string;
  domain?: string;
  email?: string;
  eventId?: string;
  keyId?: string;
  name?: string;
  permissionId?: string;
  primaryAccountId?: string;
  ruleId?: string;
  sessionId?: string;
  siteId?: string;
  status?: string;
  tokenId?: string;
  userId?: string;
  userAgentPattern?: string;
  webhookId?: string;
};

type CleanupSelection = {
  accounts: CleanupDocument[];
  agents: CleanupDocument[];
  developerApiTokens: CleanupDocument[];
  developerSessions: CleanupDocument[];
  developerUsers: CleanupDocument[];
  permissions: CleanupDocument[];
  siteAccessLogs: CleanupDocument[];
  siteAccessRules: CleanupDocument[];
  siteGuardKeys: CleanupDocument[];
  sites: CleanupDocument[];
  stripeWebhookEvents: CleanupDocument[];
  verificationLogs: CleanupDocument[];
  webhookDeliveries: CleanupDocument[];
  webhookEndpoints: CleanupDocument[];
  webhookEvents: CleanupDocument[];
};

type SelectionKey = keyof CleanupSelection;
type CleanupFilter = Record<string, unknown>;
type DeleteModel = {
  collection: {
    deleteMany: (filter: { _id: { $in: mongoose.Types.ObjectId[] } }) => Promise<{ deletedCount: number }>;
  };
};

const SELECTION_ORDER: SelectionKey[] = [
  "sites",
  "siteAccessRules",
  "siteAccessLogs",
  "siteGuardKeys",
  "agents",
  "permissions",
  "verificationLogs",
  "developerUsers",
  "developerSessions",
  "developerApiTokens",
  "accounts",
  "webhookEndpoints",
  "webhookEvents",
  "webhookDeliveries",
  "stripeWebhookEvents"
];

config({ path: path.resolve(".env") });

async function main() {
  const options = parseCleanupArgs(process.argv.slice(2));
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI after loading .env.");
  }

  if (options.execute && !isDestructiveModeAllowed(options)) {
    throw new Error(`Refusing destructive cleanup. Use --execute --confirm ${CLEANUP_CONFIRMATION}.`);
  }

  await connectToDatabase();
  printMongoTarget();

  const selection = await selectCleanupDocuments(options);
  printSelection(selection, options);

  if (!isDestructiveModeAllowed(options)) {
    console.log(`\nDry run only. Re-run with --execute --confirm ${CLEANUP_CONFIRMATION} after reviewing the matches.`);
    return;
  }

  console.warn("\nDESTRUCTIVE CLEANUP CONFIRMED. A JSON backup must be written before deletes begin.");
  const backupPath = await writeBackup(selection);
  console.log(`Backup written: ${backupPath}`);
  await deleteSelection(selection);
}

async function selectCleanupDocuments(options: CleanupOptions): Promise<CleanupSelection> {
  const olderThan = getOlderThanDate(options.olderThanDays);
  const siteFilter = addAgeFilter({
    $or: [{ domain: { $in: [...DEMO_SITE_DOMAINS] } }, { name: { $in: [...DEMO_SITE_NAMES] } }]
  }, olderThan);
  const ruleFilter = addAgeFilter({
    $or: [
      { agentIdentifier: { $in: [...DEMO_RULE_AGENT_IDENTIFIERS] } },
      { userAgentPattern: { $in: [...DEMO_RULE_USER_AGENT_PATTERNS] } },
      { allowedPaths: { $in: [...DEMO_RULE_PATH_PATTERNS] } },
      { blockedPaths: { $in: [...DEMO_RULE_PATH_PATTERNS] } }
    ]
  }, olderThan);

  const defaultSites = keepMatching(await findSites(siteFilter), isDemoSite);
  const defaultRules = keepMatching(await findSiteRules(ruleFilter), isDemoSiteRule);
  const selectedUsers = options.includeUsers
    ? keepMatching(await findDeveloperUsers(addAgeFilter({
      email: { $regex: "(test|demo|@example\\.com$)", $options: "i" }
    }, olderThan)), isDemoDeveloperUser)
    : [];
  const accountCandidates = options.includeAccounts
    ? keepMatching(await findAccounts(addAgeFilter({
      name: { $regex: "\\b(test|demo)\\b", $options: "i" }
    }, olderThan)), isDemoAccount)
    : [];
  const selectedAccounts = await selectAccountsWithoutOtherUsers(accountCandidates, selectedUsers);
  const ownerFilter = buildOwnerFilter(selectedUsers, selectedAccounts);
  const ownedSites = ownerFilter ? await findSites(ownerFilter) : [];
  const sites = uniqueDocuments([...defaultSites, ...ownedSites]);
  const siteIds = stringValues(sites, "siteId");

  const relatedRules = siteIds.length ? await findSiteRules({ siteId: { $in: siteIds } }) : [];
  const siteAccessRules = uniqueDocuments([...defaultRules, ...relatedRules]);
  const ruleIds = stringValues(siteAccessRules, "ruleId");
  const siteLogFilters: CleanupFilter[] = [];
  if (siteIds.length) {
    siteLogFilters.push({ siteId: { $in: siteIds } });
  }
  if (ruleIds.length) {
    siteLogFilters.push({ ruleId: { $in: ruleIds } });
  }

  const nameMatchedAgents = options.includeAgents
    ? keepMatching(await findAgents(addAgeFilter({
      name: { $regex: "(demo|test|sandbox|enforcement demo|site guard demo)", $options: "i" }
    }, olderThan)), isDemoAgent)
    : [];
  const ownedAgents = ownerFilter ? await findAgents(ownerFilter) : [];
  const agents = uniqueDocuments([...nameMatchedAgents, ...ownedAgents]);
  const agentIds = stringValues(agents, "agentId");
  const userIds = stringValues(selectedUsers, "userId");
  const selectedAccountIds = stringValues(selectedAccounts, "accountId");
  const webhooks = options.includeWebhooks
    ? await selectWebhooks(userIds, selectedAccountIds, agentIds)
    : { webhookDeliveries: [], webhookEndpoints: [], webhookEvents: [] };

  return {
    accounts: selectedAccounts,
    agents,
    developerApiTokens: userIds.length ? await findDeveloperApiTokens({ userId: { $in: userIds } }) : [],
    developerSessions: userIds.length ? await findDeveloperSessions({ userId: { $in: userIds } }) : [],
    developerUsers: selectedUsers,
    permissions: agentIds.length ? await findPermissions({ agentId: { $in: agentIds } }) : [],
    siteAccessLogs: siteLogFilters.length ? await findSiteAccessLogs({ $or: siteLogFilters }) : [],
    siteAccessRules,
    siteGuardKeys: siteIds.length ? await findSiteGuardKeys({ siteId: { $in: siteIds } }) : [],
    sites,
    stripeWebhookEvents: options.includeBillingTestEvents
      ? await findStripeWebhookEvents(addAgeFilter({
        eventId: { $regex: "(test|demo)", $options: "i" }
      }, olderThan))
      : [],
    verificationLogs: agentIds.length ? await findVerificationLogs({ agentId: { $in: agentIds } }) : [],
    ...webhooks
  };
}

async function selectAccountsWithoutOtherUsers(
  candidateAccounts: CleanupDocument[],
  selectedUsers: CleanupDocument[]
) {
  const selectedUserIds = new Set(stringValues(selectedUsers, "userId"));
  const accounts: CleanupDocument[] = [];

  for (const account of candidateAccounts) {
    const accountId = getString(account, "accountId");
    if (!accountId) {
      continue;
    }

    const dependentUsers = await findDeveloperUsers({ primaryAccountId: accountId });
    const hasRemainingUser = dependentUsers.some((user) => !selectedUserIds.has(getString(user, "userId") ?? ""));
    if (hasRemainingUser) {
      console.warn(`Skipping demo-looking account ${accountId}; at least one dependent user is not selected.`);
      continue;
    }

    accounts.push(account);
  }

  return accounts;
}

async function selectWebhooks(userIds: string[], accountIds: string[], agentIds: string[]) {
  const scopeFilters = buildScopeFilters(userIds, accountIds);
  const agentEventFilter = agentIds.length ? { "payload.data.agentId": { $in: agentIds } } : undefined;
  const webhookEvents = scopeFilters.length || agentEventFilter
    ? await findWebhookEvents({ $or: [...scopeFilters, ...(agentEventFilter ? [agentEventFilter] : [])] })
    : [];
  const webhookEndpoints = scopeFilters.length ? await findWebhookEndpoints({ $or: scopeFilters }) : [];
  const eventIds = stringValues(webhookEvents, "eventId");
  const webhookIds = stringValues(webhookEndpoints, "webhookId");
  const deliveryFilters = [
    ...scopeFilters,
    ...(eventIds.length ? [{ eventId: { $in: eventIds } }] : []),
    ...(webhookIds.length ? [{ webhookId: { $in: webhookIds } }] : [])
  ];

  return {
    webhookDeliveries: deliveryFilters.length ? await findWebhookDeliveries({ $or: deliveryFilters }) : [],
    webhookEndpoints,
    webhookEvents
  };
}

async function deleteSelection(selection: CleanupSelection) {
  const deleteResults: Record<string, number> = {};

  // Child records go first so selected parent deletes do not leave cleanup orphans behind.
  deleteResults.siteAccessLogs = await deleteIds(SiteAccessLog, selection.siteAccessLogs);
  deleteResults.siteAccessRules = await deleteIds(SiteAccessRule, selection.siteAccessRules);
  deleteResults.siteGuardKeys = await deleteIds(SiteGuardKey, selection.siteGuardKeys);
  deleteResults.permissions = await deleteIds(Permission, selection.permissions);
  deleteResults.verificationLogs = await deleteIds(VerificationLog, selection.verificationLogs);
  deleteResults.webhookDeliveries = await deleteIds(WebhookDelivery, selection.webhookDeliveries);
  deleteResults.webhookEvents = await deleteIds(WebhookEvent, selection.webhookEvents);
  deleteResults.webhookEndpoints = await deleteIds(WebhookEndpoint, selection.webhookEndpoints);
  deleteResults.developerSessions = await deleteIds(DeveloperSession, selection.developerSessions);
  deleteResults.developerApiTokens = await deleteIds(DeveloperApiToken, selection.developerApiTokens);
  deleteResults.sites = await deleteIds(Site, selection.sites);
  deleteResults.agents = await deleteIds(Agent, selection.agents);
  deleteResults.developerUsers = await deleteIds(DeveloperUser, selection.developerUsers);
  deleteResults.accounts = await deleteIds(Account, selection.accounts);
  deleteResults.stripeWebhookEvents = await deleteIds(StripeWebhookEvent, selection.stripeWebhookEvents);

  console.log("\nDeleted document counts:");
  for (const key of SELECTION_ORDER) {
    console.log(`  ${key}: ${deleteResults[key] ?? 0}`);
  }
}

async function writeBackup(selection: CleanupSelection) {
  const backupDirectory = path.resolve("tmp/cleanup-backups");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `demo-cleanup-${timestamp}.json`);

  await mkdir(backupDirectory, { recursive: true });
  await writeFile(backupPath, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    database: mongoose.connection.name,
    collections: selection
  }, null, 2)}\n`, { flag: "wx" });
  return backupPath;
}

function printMongoTarget() {
  const host = mongoose.connection.host || "[unknown-host]";
  const database = mongoose.connection.name || "[unknown-database]";
  console.log(`MongoDB target: host=${host} database=${database} credentials=[redacted]`);
}

function printSelection(selection: CleanupSelection, options: CleanupOptions) {
  const mode = isDestructiveModeAllowed(options) ? "execute" : "dry-run";
  const age = options.olderThanDays ? ` created more than ${options.olderThanDays} day(s) ago` : "";
  console.log(`Cleanup mode: ${mode}.${age}`);
  console.log("Selected document counts:");

  for (const key of SELECTION_ORDER) {
    const documents = selection[key];
    console.log(`  ${key}: ${documents.length}`);
    for (const document of documents) {
      console.log(`    - ${summarize(document)}`);
    }
  }
}

function summarize(document: CleanupDocument) {
  const fields = [
    `id=${getString(document, "_id") ?? "[unknown]"}`,
    publicIdentifier(document),
    textField(document, "name"),
    textField(document, "domain"),
    textField(document, "email"),
    textField(document, "status"),
    document.createdAt ? `createdAt=${document.createdAt.toISOString()}` : undefined
  ];

  return fields.filter(Boolean).join(" ");
}

function publicIdentifier(document: CleanupDocument) {
  for (const key of ["siteId", "ruleId", "keyId", "agentId", "permissionId", "userId", "sessionId", "tokenId", "accountId", "webhookId", "eventId"]) {
    const value = getString(document, key);
    if (value) {
      return `${key}=${value}`;
    }
  }

  return undefined;
}

function textField(document: CleanupDocument, key: keyof CleanupDocument) {
  const value = getString(document, key);
  return value ? `${String(key)}=${JSON.stringify(value)}` : undefined;
}

function buildOwnerFilter(users: CleanupDocument[], accounts: CleanupDocument[]) {
  const filters = buildScopeFilters(stringValues(users, "userId"), stringValues(accounts, "accountId"));
  return filters.length ? { $or: filters } : undefined;
}

function buildScopeFilters(userIds: string[], accountIds: string[]) {
  return [
    ...(userIds.length ? [{ developerUserId: { $in: userIds } }] : []),
    ...(accountIds.length ? [{ accountId: { $in: accountIds } }] : [])
  ];
}

function addAgeFilter<T extends object>(filter: T, olderThan?: Date) {
  return olderThan ? { $and: [filter, { createdAt: { $lte: olderThan } }] } : filter;
}

function uniqueDocuments(documents: CleanupDocument[]) {
  const byId = new Map<string, CleanupDocument>();
  for (const document of documents) {
    byId.set(String(document._id), document);
  }
  return [...byId.values()];
}

function stringValues(documents: CleanupDocument[], key: keyof CleanupDocument) {
  return documents.map((document) => getString(document, key)).filter((value): value is string => Boolean(value));
}

function getString(document: CleanupDocument, key: string) {
  const value = document[key];
  return value === undefined || value === null ? undefined : String(value);
}

function keepMatching(documents: CleanupDocument[], matcher: (document: CleanupDocument) => boolean) {
  return documents.filter(matcher);
}

async function deleteIds(model: DeleteModel, documents: CleanupDocument[]) {
  if (!documents.length) {
    return 0;
  }

  const result = await model.collection.deleteMany({ _id: { $in: documents.map((document) => document._id) } });
  return result.deletedCount;
}

async function findAccounts(filter: CleanupFilter) {
  return Account.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findAgents(filter: CleanupFilter) {
  return Agent.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findDeveloperApiTokens(filter: CleanupFilter) {
  return DeveloperApiToken.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findDeveloperSessions(filter: CleanupFilter) {
  return DeveloperSession.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findDeveloperUsers(filter: CleanupFilter) {
  return DeveloperUser.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findPermissions(filter: CleanupFilter) {
  return Permission.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findSiteAccessLogs(filter: CleanupFilter) {
  return SiteAccessLog.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findSiteGuardKeys(filter: CleanupFilter) {
  return SiteGuardKey.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findSiteRules(filter: CleanupFilter) {
  return SiteAccessRule.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findSites(filter: CleanupFilter) {
  return Site.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findStripeWebhookEvents(filter: CleanupFilter) {
  return StripeWebhookEvent.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findVerificationLogs(filter: CleanupFilter) {
  return VerificationLog.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findWebhookDeliveries(filter: CleanupFilter) {
  return WebhookDelivery.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findWebhookEndpoints(filter: CleanupFilter) {
  return WebhookEndpoint.find(filter).lean() as Promise<CleanupDocument[]>;
}
async function findWebhookEvents(filter: CleanupFilter) {
  return WebhookEvent.find(filter).lean() as Promise<CleanupDocument[]>;
}

main()
  .catch((error: unknown) => {
    console.error("Demo cleanup failed safely:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
