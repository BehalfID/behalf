export const CLEANUP_CONFIRMATION = "CLEAN_DEMO_DATA";

export const DEMO_SITE_DOMAINS = new Set(["demo.site.com", "website.com", "docs.example.com"]);
export const DEMO_SITE_NAMES = new Set(["Demo Site", "Docs site", "Site"]);
export const DEMO_RULE_AGENT_IDENTIFIERS = new Set(["DemoBot", "crawler_alpha"]);
export const DEMO_RULE_USER_AGENT_PATTERNS = new Set(["ExampleBot/*"]);
export const DEMO_RULE_PATH_PATTERNS = new Set(["/docs/*", "/admin/*"]);

export type CleanupOptions = {
  execute: boolean;
  confirm?: string;
  includeUsers: boolean;
  includeAccounts: boolean;
  includeAgents: boolean;
  includeWebhooks: boolean;
  includeBillingTestEvents: boolean;
  olderThanDays?: number;
};

type SiteLike = {
  domain?: string | null;
  name?: string | null;
};

type RuleLike = {
  agentIdentifier?: string | null;
  userAgentPattern?: string | null;
  allowedPaths?: string[] | null;
  blockedPaths?: string[] | null;
};

type UserLike = {
  email?: string | null;
};

type AccountLike = {
  name?: string | null;
};

type AgentLike = {
  name?: string | null;
};

export function parseCleanupArgs(args: string[]): CleanupOptions {
  const options: CleanupOptions = {
    execute: false,
    includeUsers: false,
    includeAccounts: false,
    includeAgents: false,
    includeWebhooks: false,
    includeBillingTestEvents: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--execute":
        options.execute = true;
        break;
      case "--confirm": {
        const confirmation = args[index + 1];
        if (!confirmation || confirmation.startsWith("--")) {
          throw new Error("--confirm requires a value.");
        }
        options.confirm = confirmation;
        index += 1;
        break;
      }
      case "--include-users":
        options.includeUsers = true;
        break;
      case "--include-accounts":
        options.includeAccounts = true;
        break;
      case "--include-agents":
        options.includeAgents = true;
        break;
      case "--include-webhooks":
        options.includeWebhooks = true;
        break;
      case "--include-billing-test-events":
        options.includeBillingTestEvents = true;
        break;
      case "--older-than-days": {
        const value = Number(args[index + 1]);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("--older-than-days requires a positive number.");
        }
        options.olderThanDays = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown cleanup option: ${arg}`);
    }
  }

  return options;
}

export function isDestructiveModeAllowed(options: Pick<CleanupOptions, "execute" | "confirm">) {
  return options.execute && options.confirm === CLEANUP_CONFIRMATION;
}

export function isDemoSite(site: SiteLike) {
  return DEMO_SITE_DOMAINS.has(normalize(site.domain)) || DEMO_SITE_NAMES.has(site.name?.trim() ?? "");
}

export function isDemoSiteRule(rule: RuleLike) {
  const paths = [...(rule.allowedPaths ?? []), ...(rule.blockedPaths ?? [])];

  return (
    DEMO_RULE_AGENT_IDENTIFIERS.has(rule.agentIdentifier?.trim() ?? "") ||
    DEMO_RULE_USER_AGENT_PATTERNS.has(rule.userAgentPattern?.trim() ?? "") ||
    paths.some((path) => DEMO_RULE_PATH_PATTERNS.has(path.trim()))
  );
}

export function isDemoDeveloperUser(user: UserLike) {
  const email = normalize(user.email);
  return email.includes("test") || email.includes("demo") || email.endsWith("@example.com");
}

export function isDemoAccount(account: AccountLike) {
  return /\b(?:test|demo)\b/i.test(account.name?.trim() ?? "");
}

export function isDemoAgent(agent: AgentLike) {
  return /\b(?:demo|test|sandbox|enforcement demo|site guard demo)\b/i.test(agent.name?.trim() ?? "");
}

export function getOlderThanDate(olderThanDays?: number) {
  if (!olderThanDays) {
    return undefined;
  }

  return new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
}

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}
