import { describe, expect, it } from "vitest";
import {
  matchFieldCompletions,
  matchSmartSuggestions,
  parseSmartLogQuery
} from "@/lib/smartSearch";
import { buildVerificationLogQuery } from "@/lib/verificationLogs";

describe("parseSmartLogQuery", () => {
  it("parses natural-language denied + high risk intent", () => {
    const parsed = parseSmartLogQuery("find a denied action that's high risk");
    expect(parsed.decision).toBe("denied");
    expect(parsed.risk).toBe("high");
    expect(parsed.freeText).toBe("");
  });

  it("parses structured tokens", () => {
    const parsed = parseSmartLogQuery("decision:denied risk:high action:deploy leftover");
    expect(parsed.decision).toBe("denied");
    expect(parsed.risk).toBe("high");
    expect(parsed.action).toBe("deploy");
    expect(parsed.freeText).toContain("leftover");
  });

  it("keeps plain search text when no intent markers match", () => {
    const parsed = parseSmartLogQuery("stripe.com");
    expect(parsed.freeText).toBe("stripe.com");
    expect(parsed.decision).toBeUndefined();
  });
});

describe("smart suggestion matching", () => {
  it("suggests denied log query template", () => {
    const hits = matchSmartSuggestions("denied", { scope: "logs" });
    expect(hits.some((item) => item.id === "log-denied")).toBe(true);
  });

  it("completes decision field values", () => {
    const hits = matchFieldCompletions("decision:den");
    expect(hits.map((item) => item.query)).toContain("decision:denied");
  });

  it("matches documentation pages", () => {
    const hits = matchSmartSuggestions("webhook", { scope: "docs" });
    expect(hits.some((item) => item.href === "/docs/webhooks")).toBe(true);
  });
});

describe("buildVerificationLogQuery smart search", () => {
  it("applies NL filters from the search param", () => {
    const query = buildVerificationLogQuery(
      new URLSearchParams("search=find+denied+high+risk+events"),
      { accountId: "acct_test" }
    );
    expect(query.allowed).toBe(false);
    expect(query.risk).toBe("high");
  });

  it("does not let smart search override explicit decision params", () => {
    const query = buildVerificationLogQuery(
      new URLSearchParams("decision=allowed&search=find+denied+events"),
      { accountId: "acct_test" }
    );
    expect(query.allowed).toBe(true);
  });

  it("searches permissionId as part of free-text matching", () => {
    const query = buildVerificationLogQuery(
      new URLSearchParams("search=perm_abc"),
      { accountId: "acct_test" }
    );
    const andClause = query.$and as Array<Record<string, unknown>>;
    const orClause = andClause.find((part) => Array.isArray(part.$or))?.$or as Array<Record<string, unknown>>;
    expect(orClause.some((entry) => "permissionId" in entry)).toBe(true);
  });
});
