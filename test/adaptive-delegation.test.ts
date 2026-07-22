import { describe, expect, it } from "vitest";
import {
  AdaptiveDelegationEngine,
  autoAllowKey,
  buildRecommendationFingerprint
} from "@/lib/adaptiveDelegation/engine";
import {
  buildEvidence,
  buildExplanation,
  calculateConfidence
} from "@/lib/adaptiveDelegation/confidence";
import { matchTrustProfiles } from "@/lib/adaptiveDelegation/profileMatching";
import { matchContextScopedPermissions } from "@/lib/adaptiveDelegation/contextMatching";
import { matchOrgDelegationTemplates } from "@/lib/adaptiveDelegation/orgMatching";
import {
  branchBucket,
  extractAuthorizationContext,
  listContextMatches
} from "@/lib/adaptiveDelegation/context";
import type { ApprovalPatternAggregate, ContextPatternAggregate } from "@/lib/adaptiveDelegation/types";
import { DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS } from "@/lib/adaptiveDelegation/types";
import { ORG_RECOMMENDATION_AGENT_ID } from "@/lib/adaptiveDelegation/orgTemplates";

function pattern(overrides: Partial<ApprovalPatternAggregate> = {}): ApprovalPatternAggregate {
  const now = new Date("2026-07-21T12:00:00.000Z");
  const earlier = new Date("2026-07-01T12:00:00.000Z");
  return {
    accountId: "acct_test",
    agentId: "agent_test",
    action: "repo.read",
    resource: "github.com/acme/app",
    approvedCount: 20,
    deniedCount: 0,
    usedCount: 18,
    pendingCount: 0,
    approvalRequiredLogCount: 22,
    resources: ["github.com/acme/app"],
    firstSeenAt: earlier,
    lastSeenAt: now,
    sampleApprovalIds: ["apr_1", "apr_2"],
    permissionId: "perm_1",
    ...overrides
  };
}

describe("calculateConfidence", () => {
  it("scores repeated zero-denial low-risk patterns highly", () => {
    const { confidence, factors } = calculateConfidence(pattern());
    expect(confidence).toBeGreaterThanOrEqual(70);
    expect(factors.some((factor) => factor.code === "repeated_approvals")).toBe(true);
    expect(factors.some((factor) => factor.code === "zero_denials")).toBe(true);
    expect(factors.some((factor) => factor.code === "low_risk_operation")).toBe(true);
  });

  it("penalizes denials and elevated operations", () => {
    const low = calculateConfidence(
      pattern({
        action: "deploy.production",
        resource: "production",
        approvedCount: 10,
        deniedCount: 3
      })
    );
    const high = calculateConfidence(pattern());
    expect(low.confidence).toBeLessThan(high.confidence);
    expect(low.factors.some((factor) => factor.code === "previous_denials")).toBe(true);
    expect(low.factors.some((factor) => factor.code === "elevated_permissions" || factor.code === "production_resource")).toBe(
      true
    );
  });

  it("clamps to 0–100", () => {
    const { confidence } = calculateConfidence(
      pattern({
        approvedCount: 100,
        deniedCount: 0,
        action: "repo.read"
      })
    );
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(100);
  });
});

describe("buildExplanation / buildEvidence", () => {
  it("includes counts and confidence in the explanation", () => {
    const p = pattern({ approvedCount: 12, deniedCount: 0 });
    const { confidence } = calculateConfidence(p);
    const explanation = buildExplanation(p, confidence);
    expect(explanation).toContain("12");
    expect(explanation).toContain("repo.read");
    expect(explanation).toContain(`${confidence}%`);
  });

  it("builds evidence from the aggregate", () => {
    const evidence = buildEvidence(pattern({ approvedCount: 9, deniedCount: 1, usedCount: 7 }));
    expect(evidence.approvedCount).toBe(9);
    expect(evidence.deniedCount).toBe(1);
    expect(evidence.usedCount).toBe(7);
    expect(evidence.sameAgent).toBe(true);
    expect(evidence.sameResource).toBe(true);
  });
});

describe("AdaptiveDelegationEngine", () => {
  it("emits recommendations only above thresholds", () => {
    const engine = new AdaptiveDelegationEngine({
      ...DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS,
      minApprovals: 5,
      minConfidence: 70
    });

    const recommendations = engine.generate({
      accountId: "acct_test",
      patterns: [
        pattern({ approvedCount: 20, deniedCount: 0 }),
        pattern({
          action: "deploy.production",
          resource: "production",
          approvedCount: 6,
          deniedCount: 2
        }),
        pattern({ action: "repo.read", approvedCount: 2, deniedCount: 0, agentId: "agent_other" })
      ]
    });

    expect(recommendations.length).toBeGreaterThanOrEqual(1);
    expect(recommendations.every((item) => item.confidence >= 70)).toBe(true);
    const permissionRecs = recommendations.filter((item) => item.kind === "reusable_permission");
    expect(permissionRecs.every((item) => item.proposedPermission?.requiresApproval === false)).toBe(true);
  });

  it("suppresses fingerprints and existing auto-allow keys", () => {
    const engine = new AdaptiveDelegationEngine();
    const candidate = pattern();
    const fingerprint = buildRecommendationFingerprint({
      accountId: candidate.accountId,
      agentId: candidate.agentId,
      action: candidate.action,
      resource: candidate.resource,
      kind: "reusable_permission"
    });

    const suppressed = engine.generate({
      accountId: "acct_test",
      patterns: [candidate],
      suppressedFingerprints: new Set([fingerprint])
    });
    expect(suppressed).toHaveLength(0);

    const existing = engine.generate({
      accountId: "acct_test",
      patterns: [candidate],
      existingAutoAllowKeys: new Set([
        autoAllowKey(candidate.agentId, candidate.action, candidate.resource)
      ])
    });
    expect(existing).toHaveLength(0);
  });

  it("fails closed on high denial rates", () => {
    const engine = new AdaptiveDelegationEngine();
    const recommendations = engine.generate({
      accountId: "acct_test",
      patterns: [
        pattern({
          approvedCount: 20,
          deniedCount: 8
        })
      ]
    });
    expect(recommendations).toHaveLength(0);
  });

  it("builds deterministic fingerprints", () => {
    const a = buildRecommendationFingerprint({
      accountId: "acct_1",
      agentId: "agent_1",
      action: "repo.read",
      resource: "acme/app"
    });
    const b = buildRecommendationFingerprint({
      accountId: "acct_1",
      agentId: "agent_1",
      action: "repo.read",
      resource: "acme/app"
    });
    const c = buildRecommendationFingerprint({
      accountId: "acct_1",
      agentId: "agent_1",
      action: "repo.read",
      resource: "acme/other"
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("recommends a Software Engineer trust profile from coherent history", () => {
    const engine = new AdaptiveDelegationEngine();
    const recommendations = engine.generate({
      accountId: "acct_test",
      patterns: [
        pattern({ action: "repo.read", approvedCount: 24, deniedCount: 0 }),
        pattern({ action: "github.issue.read", approvedCount: 18, deniedCount: 0, resource: "github" }),
        pattern({ action: "github.pr.comment", approvedCount: 16, deniedCount: 0, resource: "github" }),
        pattern({ action: "read_file", approvedCount: 20, deniedCount: 0, resource: null, resources: [] })
      ]
    });

    const profile = recommendations.find((item) => item.kind === "trust_profile");
    expect(profile).toBeTruthy();
    expect(profile?.proposedTrustProfile?.templateId).toBe("software_engineer");
    expect(profile?.proposedTrustProfile?.coveragePercent).toBeGreaterThanOrEqual(60);
    expect(profile?.proposedTrustProfile?.permissions.some((p) => p.requiresApproval)).toBe(true);
    expect(profile?.securityImpact.riskNotes.join(" ")).toContain("explicit confirmation");
  });

  it("does not recommend trust profiles below coverage thresholds", () => {
    const engine = new AdaptiveDelegationEngine();
    const recommendations = engine.generate({
      accountId: "acct_test",
      patterns: [pattern({ action: "repo.read", approvedCount: 30, deniedCount: 0 })]
    });
    expect(recommendations.every((item) => item.kind !== "trust_profile")).toBe(true);
  });

  it("suppresses already-applied trust profiles", () => {
    const engine = new AdaptiveDelegationEngine();
    const patterns = [
      pattern({ action: "repo.read", approvedCount: 24, deniedCount: 0 }),
      pattern({ action: "github.issue.read", approvedCount: 18, deniedCount: 0, resource: "github" }),
      pattern({ action: "github.pr.comment", approvedCount: 16, deniedCount: 0, resource: "github" }),
      pattern({ action: "read_file", approvedCount: 20, deniedCount: 0, resource: null, resources: [] })
    ];
    const withProfile = engine.generate({ accountId: "acct_test", patterns });
    expect(withProfile.some((item) => item.kind === "trust_profile")).toBe(true);

    const suppressed = engine.generate({
      accountId: "acct_test",
      patterns,
      existingTrustProfileKeys: new Set(["agent_test|software_engineer"])
    });
    expect(suppressed.every((item) => item.kind !== "trust_profile")).toBe(true);
  });
});

describe("matchTrustProfiles", () => {
  it("matches research assistant when browse/read/create patterns exist", () => {
    const matches = matchTrustProfiles({
      accountId: "acct_test",
      agentId: "agent_test",
      thresholds: DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS,
      patterns: [
        pattern({ action: "browse_web", approvedCount: 14, deniedCount: 0, resource: null, resources: [] }),
        pattern({ action: "access_data", approvedCount: 12, deniedCount: 0, resource: null, resources: [] }),
        pattern({ action: "create_content", approvedCount: 11, deniedCount: 0, resource: null, resources: [] }),
        pattern({ action: "read_file", approvedCount: 10, deniedCount: 0, resource: null, resources: [] })
      ]
    });

    expect(matches.some((match) => match.template.id === "research_assistant")).toBe(true);
  });
});

describe("Stage 5 context helpers", () => {
  it("extracts repository/branch/environment from metadata", () => {
    expect(
      extractAuthorizationContext({
        repository: "acme/app",
        branch: "feature/login",
        environment: "staging"
      })
    ).toEqual({
      repository: "acme/app",
      branch: "feature/login",
      environment: "staging",
      workspace: null
    });
    expect(branchBucket("feature/login")).toBe("feature/*");
    expect(branchBucket("main")).toBe("main");
    expect(listContextMatches(["feature/*"], "feature/login")).toBe(true);
    expect(listContextMatches(["main"], "feature/login")).toBe(false);
  });
});

describe("matchContextScopedPermissions", () => {
  function contextSlice(
    overrides: Partial<ContextPatternAggregate> & Pick<ContextPatternAggregate, "value" | "protected">
  ): ContextPatternAggregate {
    return {
      accountId: "acct_test",
      agentId: "agent_test",
      action: "git.commit",
      dimension: "branch",
      approvedCount: 12,
      deniedCount: 0,
      usedCount: 10,
      firstSeenAt: new Date("2026-07-01T12:00:00.000Z"),
      lastSeenAt: new Date("2026-07-21T12:00:00.000Z"),
      sampleApprovalIds: ["apr_ctx"],
      ...overrides
    };
  }

  it("recommends allow on feature branches while contrasting main", () => {
    const matches = matchContextScopedPermissions({
      accountId: "acct_test",
      agentId: "agent_test",
      thresholds: DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS,
      contextPatterns: [
        contextSlice({ value: "feature/*", protected: false, approvedCount: 20 }),
        contextSlice({ value: "main", protected: true, approvedCount: 1, deniedCount: 2 })
      ]
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.proposedPermission.constraints?.allowedBranches).toContain("feature/*");
    expect(matches[0]?.proposedPermission.constraints?.deniedBranches).toContain("main");
    expect(matches[0]?.proposedPermission.requiresApproval).toBe(false);
  });

  it("fails closed without enough safe-context approvals", () => {
    const matches = matchContextScopedPermissions({
      accountId: "acct_test",
      agentId: "agent_test",
      thresholds: DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS,
      contextPatterns: [
        contextSlice({ value: "feature/*", protected: false, approvedCount: 2 }),
        contextSlice({ value: "main", protected: true, approvedCount: 0, deniedCount: 1 })
      ]
    });
    expect(matches).toHaveLength(0);
  });
});

describe("AdaptiveDelegationEngine Stage 5", () => {
  it("emits context_scoped_permission recommendations from context patterns", () => {
    const engine = new AdaptiveDelegationEngine();
    const recommendations = engine.generate({
      accountId: "acct_test",
      patterns: [],
      contextPatterns: [
        {
          accountId: "acct_test",
          agentId: "agent_test",
          action: "git.commit",
          dimension: "branch",
          value: "feature/*",
          protected: false,
          approvedCount: 18,
          deniedCount: 0,
          usedCount: 15,
          firstSeenAt: new Date("2026-07-01T12:00:00.000Z"),
          lastSeenAt: new Date("2026-07-21T12:00:00.000Z"),
          sampleApprovalIds: ["apr_1"]
        },
        {
          accountId: "acct_test",
          agentId: "agent_test",
          action: "git.commit",
          dimension: "branch",
          value: "main",
          protected: true,
          approvedCount: 0,
          deniedCount: 3,
          usedCount: 0,
          firstSeenAt: new Date("2026-07-01T12:00:00.000Z"),
          lastSeenAt: new Date("2026-07-21T12:00:00.000Z"),
          sampleApprovalIds: ["apr_2"]
        }
      ]
    });

    const contextRec = recommendations.find((item) => item.kind === "context_scoped_permission");
    expect(contextRec).toBeTruthy();
    expect(contextRec?.proposedPermission?.constraints?.allowedBranches).toContain("feature/*");
  });
});

describe("matchOrgDelegationTemplates", () => {
  it("recommends Engineering when multiple agents share engineering approvals", () => {
    const matches = matchOrgDelegationTemplates({
      accountId: "acct_test",
      thresholds: DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS,
      agentNames: new Map([
        ["agent_a", "Builder A"],
        ["agent_b", "Builder B"]
      ]),
      patterns: [
        pattern({
          agentId: "agent_a",
          action: "repo.read",
          approvedCount: 20,
          deniedCount: 0
        }),
        pattern({
          agentId: "agent_a",
          action: "github.issue.read",
          approvedCount: 12,
          deniedCount: 0,
          resource: "github"
        }),
        pattern({
          agentId: "agent_a",
          action: "github.pr.comment",
          approvedCount: 10,
          deniedCount: 0,
          resource: "github"
        }),
        pattern({
          agentId: "agent_a",
          action: "read_file",
          approvedCount: 14,
          deniedCount: 0,
          resource: null,
          resources: []
        }),
        pattern({
          agentId: "agent_b",
          action: "repo.read",
          approvedCount: 18,
          deniedCount: 0
        }),
        pattern({
          agentId: "agent_b",
          action: "github.pr.comment",
          approvedCount: 11,
          deniedCount: 0,
          resource: "github"
        }),
        pattern({
          agentId: "agent_b",
          action: "read_file",
          approvedCount: 9,
          deniedCount: 0,
          resource: null,
          resources: []
        })
      ]
    });

    const engineering = matches.find((match) => match.template.id === "engineering");
    expect(engineering).toBeTruthy();
    expect(engineering?.agentIds).toEqual(["agent_a", "agent_b"]);
    expect(engineering?.evidence.sameAgent).toBe(false);
    expect(engineering?.evidence.distinctAgents).toBe(2);
    expect(engineering?.proposedOrgDelegation.permissions.some((p) => p.requiresApproval)).toBe(true);
  });

  it("fails closed with only one agent", () => {
    const matches = matchOrgDelegationTemplates({
      accountId: "acct_test",
      thresholds: DEFAULT_ADAPTIVE_DELEGATION_THRESHOLDS,
      patterns: [
        pattern({ agentId: "agent_a", action: "repo.read", approvedCount: 20 }),
        pattern({
          agentId: "agent_a",
          action: "github.issue.read",
          approvedCount: 12,
          resource: "github"
        }),
        pattern({
          agentId: "agent_a",
          action: "github.pr.comment",
          approvedCount: 10,
          resource: "github"
        }),
        pattern({
          agentId: "agent_a",
          action: "read_file",
          approvedCount: 14,
          resource: null,
          resources: []
        })
      ]
    });
    expect(matches.every((match) => match.template.id !== "engineering")).toBe(true);
  });
});

describe("AdaptiveDelegationEngine Stage 6", () => {
  it("emits organization_delegation recommendations across agents", () => {
    const engine = new AdaptiveDelegationEngine();
    const recommendations = engine.generate({
      accountId: "acct_test",
      agentNames: new Map([
        ["agent_a", "A"],
        ["agent_b", "B"]
      ]),
      patterns: [
        pattern({ agentId: "agent_a", action: "repo.read", approvedCount: 20 }),
        pattern({
          agentId: "agent_a",
          action: "github.issue.read",
          approvedCount: 12,
          resource: "github"
        }),
        pattern({
          agentId: "agent_a",
          action: "github.pr.comment",
          approvedCount: 10,
          resource: "github"
        }),
        pattern({
          agentId: "agent_a",
          action: "read_file",
          approvedCount: 14,
          resource: null,
          resources: []
        }),
        pattern({ agentId: "agent_b", action: "repo.read", approvedCount: 18 }),
        pattern({
          agentId: "agent_b",
          action: "github.pr.comment",
          approvedCount: 11,
          resource: "github"
        }),
        pattern({
          agentId: "agent_b",
          action: "read_file",
          approvedCount: 9,
          resource: null,
          resources: []
        })
      ]
    });

    const orgRec = recommendations.find((item) => item.kind === "organization_delegation");
    expect(orgRec).toBeTruthy();
    expect(orgRec?.agentId).toBe(ORG_RECOMMENDATION_AGENT_ID);
    expect(orgRec?.proposedOrgDelegation?.templateId).toBe("engineering");
    expect(orgRec?.proposedOrgDelegation?.agentIds).toContain("agent_a");
    expect(orgRec?.proposedOrgDelegation?.agentIds).toContain("agent_b");
  });

  it("suppresses already-accepted org templates", () => {
    const engine = new AdaptiveDelegationEngine();
    const patterns = [
      pattern({ agentId: "agent_a", action: "repo.read", approvedCount: 20 }),
      pattern({
        agentId: "agent_a",
        action: "github.issue.read",
        approvedCount: 12,
        resource: "github"
      }),
      pattern({
        agentId: "agent_a",
        action: "github.pr.comment",
        approvedCount: 10,
        resource: "github"
      }),
      pattern({
        agentId: "agent_a",
        action: "read_file",
        approvedCount: 14,
        resource: null,
        resources: []
      }),
      pattern({ agentId: "agent_b", action: "repo.read", approvedCount: 18 }),
      pattern({
        agentId: "agent_b",
        action: "github.pr.comment",
        approvedCount: 11,
        resource: "github"
      }),
      pattern({
        agentId: "agent_b",
        action: "read_file",
        approvedCount: 9,
        resource: null,
        resources: []
      })
    ];

    const suppressed = engine.generate({
      accountId: "acct_test",
      patterns,
      existingOrgTemplateIds: new Set(["engineering"])
    });
    expect(suppressed.every((item) => item.proposedOrgDelegation?.templateId !== "engineering")).toBe(
      true
    );
  });
});
