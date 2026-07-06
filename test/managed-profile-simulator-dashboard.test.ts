import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("managed profile simulator dashboard source", () => {
  const source = readFileSync(
    join(process.cwd(), "components/dashboard/ManagedProfilesView.tsx"),
    "utf-8"
  );

  it("includes simulator panel", () => {
    expect(source).toContain('data-testid="managed-profile-simulator"');
  });

  it("includes tool select", () => {
    expect(source).toContain('data-testid="simulator-tool-select"');
    expect(source).toContain('value="claude"');
    expect(source).toContain('value="codex"');
    expect(source).toContain('value="cursor"');
  });

  it("includes repo hash input", () => {
    expect(source).toContain('data-testid="simulator-repo-hash"');
  });

  it("renders mode and reason in result card", () => {
    expect(source).toContain('data-testid="simulator-result-mode"');
    expect(source).toContain('data-testid="simulator-result-reason"');
    expect(source).toContain("/api/cli/session-policy/simulate");
  });
});

describe("managed profile onboarding dashboard source", () => {
  const source = readFileSync(
    join(process.cwd(), "components/dashboard/ManagedProfilesView.tsx"),
    "utf-8"
  );
  const onboardingSource = readFileSync(
    join(process.cwd(), "lib/managedProfileOnboarding.ts"),
    "utf-8"
  );

  it("includes onboarding card", () => {
    expect(source).toContain('data-testid="managed-profile-onboarding"');
    expect(source).toContain("Connect your first managed CLI");
    expect(source).toContain(
      "Install shims, verify policy, and launch your first managed coding agent."
    );
  });

  it("renders install, status, simulate, and launch commands", () => {
    expect(source).toContain("MANAGED_PROFILE_ONBOARDING_STEPS");
    expect(onboardingSource).toContain("CLI_NPM_INSTALL_COMMAND");
    expect(onboardingSource).toContain("behalf login");
    expect(onboardingSource).toContain("behalf profile install");
    expect(onboardingSource).toContain("behalf profile status --tool claude");
    expect(onboardingSource).toContain("behalf profile simulate --tool claude");
    expect(onboardingSource).toMatch(/\bclaude\b/);
  });

  it("uses compact command rows with copy feedback", () => {
    expect(source).toContain("OnboardingCommandGroup");
    expect(source).toContain("OnboardingCompactCommand");
    expect(source).toContain("onboarding-command-row");
    expect(source).toContain('"Copied"');
    expect(source).toContain('"Copy"');
  });

  it("includes policy status callout copy", () => {
    expect(source).toContain("Managed Profiles disabled");
    expect(source).toContain("Enable the policy before expecting enforcement.");
    expect(source).toContain('data-testid="managed-profile-onboarding-policy-hint"');
  });

  it("includes no protected repos helper copy", () => {
    expect(source).toContain("No protected repos");
    expect(source).toContain("Run a managed tool, then enroll the repo from Activity.");
    expect(source).toContain("Protected repo enforcement configured");
    expect(source).toContain("At least one repo is protected.");
  });

  it("includes activity link and hint", () => {
    expect(source).toContain('data-testid="managed-profile-onboarding-activity-link"');
    expect(source).toContain("/dashboard/managed-profiles/activity");
    expect(source).toContain("/api/dashboard/managed-profiles/activity?limit=1");
    expect(source).toContain("No activity yet");
    expect(source).toContain("Launch a managed tool after installing shims.");
    expect(source).toContain("Last activity");
  });

  it("links to policy simulator, protected repos, and CLI docs", () => {
    expect(source).toContain("View activity");
    expect(source).toContain("Jump to simulator");
    expect(source).toContain("#managed-profile-simulator");
    expect(source).toContain("#managed-profile-protected-repos");
    expect(source).toContain("/docs/cli");
    expect(source).toContain("managed-profile-onboarding-action");
  });
});

describe("cli install commands", () => {
  it("builds npm install command from package name", async () => {
    const { CLI_NPM_INSTALL_COMMAND } = await import("@/lib/cliInstallCommands");
    expect(CLI_NPM_INSTALL_COMMAND).toMatch(/^npm install -g @.+\/cli$/);
  });

  it("docs cli page uses shared npm install command", () => {
    const docsSource = readFileSync(join(process.cwd(), "app/docs/cli/page.tsx"), "utf-8");
    expect(docsSource).toContain("CLI_NPM_INSTALL_COMMAND");
    expect(docsSource).not.toContain("npm install -g behalf");
  });
});

describe("managed profile activity empty state", () => {
  it("does not duplicate unfiltered empty copy in table rows", () => {
    const source = readFileSync(
      join(process.cwd(), "components/dashboard/ManagedProfileActivityView.tsx"),
      "utf-8"
    );
    expect(source).toContain("managed-activity-empty__title");
    expect(source).toContain("No managed profile activity yet");
    expect(source).not.toMatch(
      /No managed profile activity yet\.[\s\S]*ops-events__empty[\s\S]*No managed profile activity yet\./
    );
  });
});
