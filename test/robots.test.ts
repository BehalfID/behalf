import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: { next: vi.fn(), redirect: vi.fn(), rewrite: vi.fn() }
}));
vi.mock("next-intl/middleware", () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "de", "es", "fr"], defaultLocale: "en", localePrefix: "as-needed" }
}));

import robots, { OPENAI_ADS_USER_AGENT } from "@/app/robots";
import { config, shouldBypassProxy } from "@/proxy";

type Rule = {
  userAgent?: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
};

function rules(): Rule[] {
  const { rules: value } = robots();
  return (Array.isArray(value) ? value : [value]) as Rule[];
}

function groupFor(userAgent: string): Rule {
  const match = rules().find((rule) => {
    const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent];
    return agents.includes(userAgent);
  });
  expect(match, `no robots.txt group for "${userAgent}"`).toBeDefined();
  return match as Rule;
}

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

describe("robots.txt", () => {
  it("keeps the wildcard group crawlable", () => {
    const wildcard = groupFor("*");
    expect(asList(wildcard.allow)).toContain("/");
    expect(asList(wildcard.disallow)).not.toContain("/");
  });

  it("gives OpenAI's ads crawler its own allow group", () => {
    // OAI-AdsBot validates ChatGPT ad landing pages. It matches its own
    // robots.txt token, so the "*" group above never applies to it.
    expect(OPENAI_ADS_USER_AGENT).toBe("OAI-AdsBot");

    const ads = groupFor(OPENAI_ADS_USER_AGENT);
    expect(asList(ads.allow)).toContain("/");
    expect(asList(ads.disallow)).not.toContain("/");
  });

  it("keeps the ads group's disallow list in sync with the wildcard group", () => {
    // A group with its own rules does not inherit "*", so anything hidden from
    // general crawlers has to be repeated for OAI-AdsBot or the two diverge.
    const wildcard = asList(groupFor("*").disallow).sort();
    const ads = asList(groupFor(OPENAI_ADS_USER_AGENT).disallow).sort();
    expect(ads).toEqual(wildcard);
  });

  it("never blocks an OpenAI agent", () => {
    const openAiAgents = ["OAI-AdsBot", "OAI-SearchBot", "GPTBot", "ChatGPT-User"];
    for (const rule of rules()) {
      const agents = asList(rule.userAgent);
      if (!agents.some((agent) => openAiAgents.includes(agent))) continue;
      expect(asList(rule.disallow), `${agents.join(",")} is disallowed at the root`).not.toContain("/");
    }
  });

  it("advertises the sitemap", () => {
    expect(robots().sitemap).toBe("https://behalfid.com/sitemap.xml");
  });

  it("serves /robots.txt ahead of locale routing so crawlers can read it", () => {
    // An unreachable robots.txt is the same as a missing one: the proxy has to
    // let it through untouched rather than redirecting it under /[locale].
    expect(shouldBypassProxy("/robots.txt")).toBe(true);
    expect(shouldBypassProxy("/sitemap.xml")).toBe(true);
    // Belt and braces: the middleware matcher excludes it too, so the proxy is
    // never invoked for robots.txt in the first place.
    expect(config.matcher.some((m) => m.includes("robots\\.txt"))).toBe(true);
  });
});
