/** Public repository facade — dispatches via BEHALFID_REPOSITORY_BACKEND. */
import * as mongo from "@/lib/repositories/mongo/sites";
import { delegate } from "@/lib/repositories/delegate";

export type {
  SiteLean,
  SiteAccessRuleLean,
  SiteAccessLogLean,
  SiteGuardKeyLean,
} from "@/lib/repositories/mongo/sites";

export {
  siteModel,
  accessLogModel,
  accessRuleModel,
  keyModel,
  siteRepository,
  siteAccessRuleRepository,
  siteAccessLogRepository,
  siteGuardKeyRepository,
} from "@/lib/repositories/mongo/sites";

export const findSite = delegate("sites", "findSite", mongo.findSite);
export const createSite = delegate("sites", "createSite", mongo.createSite);
export const updateSite = delegate("sites", "updateSite", mongo.updateSite);
export const listSites = delegate("sites", "listSites", mongo.listSites);
export const createRule = delegate("sites", "createRule", mongo.createRule);
export const updateRule = delegate("sites", "updateRule", mongo.updateRule);
export const deleteRule = delegate("sites", "deleteRule", mongo.deleteRule);
export const findRulesBySite = delegate("sites", "findRulesBySite", mongo.findRulesBySite);
export const createAccessLog = delegate("sites", "createAccessLog", mongo.createAccessLog);
export const listAccessLogs = delegate("sites", "listAccessLogs", mongo.listAccessLogs);
export const findKeyByHash = delegate("sites", "findKeyByHash", mongo.findKeyByHash);
export const createKey = delegate("sites", "createKey", mongo.createKey);
export const revokeKey = delegate("sites", "revokeKey", mongo.revokeKey);
export const listKeys = delegate("sites", "listKeys", mongo.listKeys);
export const touchLastUsed = delegate("sites", "touchLastUsed", mongo.touchLastUsed);
export const findSites = delegate("sites", "findSites", mongo.findSites);
export const createSiteDocument = delegate("sites", "createSiteDocument", mongo.createSiteDocument);
export const findOneSite = delegate("sites", "findOneSite", mongo.findOneSite);
export const findOneAndUpdateSite = delegate("sites", "findOneAndUpdateSite", mongo.findOneAndUpdateSite);
export const findRules = delegate("sites", "findRules", mongo.findRules);
export const createRuleDocument = delegate("sites", "createRuleDocument", mongo.createRuleDocument);
export const findOneRule = delegate("sites", "findOneRule", mongo.findOneRule);
export const findOneAndUpdateRule = delegate("sites", "findOneAndUpdateRule", mongo.findOneAndUpdateRule);
export const findAccessLogs = delegate("sites", "findAccessLogs", mongo.findAccessLogs);
export const findKeys = delegate("sites", "findKeys", mongo.findKeys);
export const createKeyDocument = delegate("sites", "createKeyDocument", mongo.createKeyDocument);
export const findOneAndUpdateKey = delegate("sites", "findOneAndUpdateKey", mongo.findOneAndUpdateKey);
