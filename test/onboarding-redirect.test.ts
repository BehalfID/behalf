import { describe, expect, it } from "vitest";
import {
  ACCOUNT_SETUP_LAUNCH,
  shouldForceAccountSetupFromContext,
  shouldShowAccountSetupBanner
} from "@/lib/onboardingRedirect";

describe("onboarding redirect heuristic", () => {
  it("exports a named launch cutoff constant", () => {
    expect(ACCOUNT_SETUP_LAUNCH.toISOString()).toBe("2026-07-02T00:00:00.000Z");
  });

  it("hard-redirects only new post-launch users without activity", () => {
    expect(
      shouldForceAccountSetupFromContext({
        onboardingCompletedAt: null,
        createdAt: "2026-07-03T00:00:00.000Z",
        agentCount: 0,
        verificationCount: 0
      })
    ).toBe(true);
  });

  it("does not hard-redirect legacy users", () => {
    expect(
      shouldForceAccountSetupFromContext({
        onboardingCompletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        agentCount: 0,
        verificationCount: 0
      })
    ).toBe(false);
  });

  it("does not hard-redirect active accounts missing setup completion", () => {
    expect(
      shouldForceAccountSetupFromContext({
        onboardingCompletedAt: null,
        createdAt: "2026-07-03T00:00:00.000Z",
        agentCount: 2,
        verificationCount: 0
      })
    ).toBe(false);
  });

  it("shows a soft banner for active legacy users without setup completion", () => {
    expect(
      shouldShowAccountSetupBanner({
        onboardingCompletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        agentCount: 3,
        verificationCount: 10
      })
    ).toBe(true);
  });

  it("hides the soft banner when setup is complete", () => {
    expect(
      shouldShowAccountSetupBanner({
        onboardingCompletedAt: "2026-07-03T00:00:00.000Z",
        createdAt: "2026-07-03T00:00:00.000Z",
        agentCount: 0,
        verificationCount: 0
      })
    ).toBe(false);
  });

  it("does not show soft banner while hard redirect applies", () => {
    expect(
      shouldShowAccountSetupBanner({
        onboardingCompletedAt: null,
        createdAt: "2026-07-03T00:00:00.000Z",
        agentCount: 0,
        verificationCount: 0
      })
    ).toBe(false);
  });
});
